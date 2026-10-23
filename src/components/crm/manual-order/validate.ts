import { normalizeMaPhone } from "@/lib/phone";
import type {
  OrderLineItem,
  SerializableProduct,
  SerializableVariant,
} from "./types";

export function validateManualOrder(input: {
  customerName: string;
  customerPhone: string;
  address: string;
  note: string;
  lines: OrderLineItem[];
  getLineVariant: (line: OrderLineItem) => SerializableVariant | undefined;
  variantTotals: Map<string, number>;
  variantsMap: Map<string, { product: SerializableProduct; variant: SerializableVariant }>;
}): Record<string, string> {
  const { customerName, customerPhone, address, note, lines, getLineVariant, variantTotals, variantsMap } = input;
  const errors: Record<string, string> = {};

  if (!customerName.trim() || customerName.trim().length < 2) {
    errors.customerName = "Le nom complet est requis (au moins 2 caractères).";
  }

  if (!customerPhone.trim()) {
    errors.customerPhone = "Le numéro de téléphone est requis.";
  } else if (normalizeMaPhone(customerPhone) === null) {
    errors.customerPhone = "Numéro marocain invalide (ex : 0612345678 ou +212612345678).";
  }

  if (lines.length === 0) {
    errors.items = "Au moins un article est requis.";
  } else {
    let hasIncomplete = false;
    for (const line of lines) {
      const v = getLineVariant(line);
      if (!v) {
        hasIncomplete = true;
        break;
      }
    }
    if (hasIncomplete) {
      errors.items = "Veuillez choisir un produit et une variante pour chaque article.";
    }
  }

  // Check aggregate qty limit <= 10
  for (const [variantId, totalQty] of variantTotals.entries()) {
    if (totalQty > 10) {
      const vInfo = variantsMap.get(variantId);
      const name = vInfo ? `${vInfo.product.name} (${vInfo.variant.label || "Standard"} · SKU ${vInfo.variant.sku})` : "Un article";
      errors.items = `La quantité cumulée pour « ${name} » dépasse 10 (actuellement ${totalQty}).`;
      break;
    }
  }

  if (address.length > 500) {
    errors.address = "L'adresse ne peut pas dépasser 500 caractères.";
  }

  if (note.length > 2000) {
    errors.note = "La note ne peut pas dépasser 2000 caractères.";
  }

  return errors;
}
