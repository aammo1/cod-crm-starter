import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { catalogAgentKey, CatalogAgentError } from "@/lib/catalog-agent-auth";
import { contentTypeForStoredName, getUploadDir, isSafeStoredName } from "@/lib/uploads";
import { getAppState, setAppState } from "./app-state";
import {
  archiveProduct, createProduct, getProductById, getProductBySlug,
  listProducts, restoreProduct, updateProduct, type CatalogProduct,
} from "./catalog";
import { colorInputSchema, createProductSchema, productBaseSchema } from "./catalog-schemas";
import { stockQuantitySchema } from "./inventory-schemas";

const requestIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);
const base = productBaseSchema.extend({ colors: z.array(colorInputSchema.strict()).min(1) }).strict();
const createData = base.extend({
  initialStock: z.array(z.object({ colorKey: z.string().trim().min(1), size: z.string().trim().min(1), qty: stockQuantitySchema }).strict()).max(500).optional(),
}).superRefine((data, ctx) => {
  const checked = createProductSchema.safeParse(data);
  if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue(issue);
});
const editData = base.partial().omit({ slug: true }).superRefine((data, ctx) => {
  if (!Object.keys(data).length) ctx.addIssue({ code: "custom", message: "Aucune modification fournie." });
  if (data.colors && !data.sizes) ctx.addIssue({ code: "custom", message: "Fournissez la liste finale des pointures avec les couleurs." });
  if (data.sizes && new Set(data.sizes).size !== data.sizes.length) ctx.addIssue({ code: "custom", message: "Pointures en double." });
  if (data.colors && new Set(data.colors.map(c => c.name)).size !== data.colors.length) ctx.addIssue({ code: "custom", message: "Couleurs en double." });
});
export const catalogOperationSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), requestId: requestIdSchema, data: createData }).strict(),
  z.object({ command: z.literal("edit"), requestId: requestIdSchema, target: z.string().min(1), data: editData }).strict(),
  z.object({ command: z.literal("archive"), requestId: requestIdSchema, target: z.string().min(1) }).strict(),
  z.object({ command: z.literal("restore"), requestId: requestIdSchema, target: z.string().min(1) }).strict(),
]);
type Operation = z.infer<typeof catalogOperationSchema>;

// Canonical serialization keeps signatures and receipts independent of JSON key order.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

export function catalogRevision(): string {
  return hash(listProducts({ includeInactive: true }).sort((a, b) => a.id.localeCompare(b.id)));
}

export function findCatalogProduct(target: string): CatalogProduct {
  const byId = getProductById(target);
  const bySlug = getProductBySlug(target);
  if (byId && bySlug && byId.id !== bySlug.id) throw new CatalogAgentError("Référence produit ambiguë.", 409);
  const product = byId ?? bySlug;
  if (!product) throw new CatalogAgentError("Produit introuvable.", 404);
  return product;
}

function checkImages(operation: Operation, applying: boolean): void {
  if (operation.command !== "create" && operation.command !== "edit") return;
  for (const color of operation.data.colors ?? []) {
    for (const image of color.images) {
      // Only local media paths: the API never fetches external URLs.
      if (image.startsWith("/api/media/")) {
        const name = image.slice("/api/media/".length);
        if (!isSafeStoredName(name) || !contentTypeForStoredName(name) || (applying && !existsSync(path.join(getUploadDir(), name)))) {
          throw new CatalogAgentError("Image téléversée introuvable ou invalide.");
        }
      } else if (/^\/images\/[A-Za-z0-9_./-]+$/.test(image) && !image.split("/").includes("..")) {
        if (!existsSync(path.join(process.cwd(), "public", image))) throw new CatalogAgentError("Image publique introuvable.");
      } else throw new CatalogAgentError("Utilisez une image locale du catalogue ou une image téléversée.");
    }
  }
}

function execute(operation: Operation, applying: boolean): CatalogProduct {
  checkImages(operation, applying);
  if (operation.command === "create") {
    return createProduct({ ...operation.data, requestId: `agent-${hash(operation.requestId)}` }, { actor: "catalog-agent" });
  }
  const product = findCatalogProduct(operation.target);
  if (operation.command === "edit") return updateProduct(product.id, operation.data);
  if (operation.command === "archive") archiveProduct(product.id);
  else restoreProduct(product.id);
  return getProductById(product.id)!;
}

interface Receipt {
  requestHash: string;
  command: Operation["command"];
  product: CatalogProduct;
  appliedAt: string;
}
export function catalogReceipt(requestId: string): Receipt | null {
  requestIdSchema.parse(requestId);
  const raw = getAppState(`catalog-agent:${requestId}`);
  return raw ? JSON.parse(raw) as Receipt : null;
}

interface PreviewProof { requestHash: string; revision: string; expiresAt: number }
const sign = (body: string) => createHmac("sha256", catalogAgentKey()).update(`catalog-preview:${body}`).digest("hex");

export function previewCatalogOperation(input: unknown) {
  const operation = catalogOperationSchema.parse(input);
  const existing = catalogReceipt(operation.requestId);
  if (existing) {
    if (existing.requestHash !== hash(operation)) throw new CatalogAgentError("Identifiant de requête déjà utilisé.", 409);
    return { alreadyApplied: true as const, receipt: existing };
  }
  let before: CatalogProduct | null = null;
  let after: CatalogProduct | null = null;
  let revision = "";
  // Run the real services inside a rolled-back transaction. This validates SKU,
  // slug and variant behavior without a separate, drifting preview implementation.
  const rollback = new Error("preview rollback");
  try {
    getDb().transaction(() => {
      revision = catalogRevision();
      before = operation.command === "create" ? null : findCatalogProduct(operation.target);
      after = execute(operation, false);
      throw rollback;
    }).immediate();
  } catch (error) { if (error !== rollback) throw error; }
  const proof: PreviewProof = { requestHash: hash(operation), revision, expiresAt: Date.now() + 30 * 60_000 };
  const body = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return {
    alreadyApplied: false as const, operation, before, after,
    preview: `${body}.${sign(body)}`, expiresAt: new Date(proof.expiresAt).toISOString(),
    notes: [
      "Les identifiants des nouvelles variantes sont provisoires dans cet aperçu.",
      "Les couleurs et pointures fournies remplacent la sélection active. Les variantes retirées et leur historique sont conservés.",
      "Les nouvelles variantes créées lors d’une modification démarrent à zéro ; les variantes réactivées conservent leur stock.",
      "Aucune image retirée n’est supprimée du stockage.",
    ],
  };
}

export function applyCatalogOperation(input: unknown, preview: string) {
  const operation = catalogOperationSchema.parse(input);
  const requestHash = hash(operation);
  return getDb().transaction(() => {
    const receipt = catalogReceipt(operation.requestId);
    if (receipt) {
      if (receipt.requestHash !== requestHash) throw new CatalogAgentError("Identifiant de requête déjà utilisé.", 409);
      return { replayed: true, ...receipt };
    }
    const [body, signature, extra] = preview.split(".");
    if (!body || !signature || extra || !/^[a-f0-9]{64}$/.test(signature) ||
        !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(body), "hex"))) {
      throw new CatalogAgentError("Aperçu invalide : préparez un nouvel aperçu.", 409);
    }
    const proof = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewProof;
    if (proof.requestHash !== requestHash || proof.expiresAt < Date.now() || proof.revision !== catalogRevision()) {
      throw new CatalogAgentError("Le catalogue ou la demande a changé, ou l’aperçu a expiré. Faites approuver un nouvel aperçu.", 409);
    }
    const product = execute(operation, true);
    const saved: Receipt = { requestHash, command: operation.command, product, appliedAt: new Date().toISOString() };
    setAppState(`catalog-agent:${operation.requestId}`, JSON.stringify(saved));
    return { replayed: false, ...saved };
  }).immediate();
}
