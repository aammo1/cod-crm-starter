import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import sharp from "sharp";
import { loadSource } from "../test-source.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "upload-reencode-"));
process.env.DB_PATH = path.join(temp, "test.db");
process.env.UPLOAD_DIR = path.join(temp, "uploads");
process.env.DELIVERY_PROVIDER = "mock";
after(() => fs.rmSync(temp, { recursive: true, force: true }));

// Only the session guard is replaced; the real upload route, sharp and storage run.
class AuthGuardError extends Error {}
function loadRoute() {
  const original = Module._load;
  Module._load = function (request, ...args) {
    if (request === "@/lib/auth-guards") return { AuthGuardError, requireAdmin: async () => ({ role: "admin" }) };
    return original.call(this, request, ...args);
  };
  try { return loadSource("@/app/api/admin/upload/route"); } finally { Module._load = original; }
}
const { POST } = loadRoute();

function upload(buffer, type, name) {
  const form = new FormData();
  form.append("file", new File([buffer], name, { type }));
  return POST(new Request("http://localhost/api/admin/upload", { method: "POST", body: form }));
}

test("JPEG with EXIF GPS metadata is re-encoded without exif", async () => {
  const source = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
    .jpeg().withExifMerge({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "33/1 35/1 0/1" } }).toBuffer();
  assert.ok((await sharp(source).metadata()).exif, "fixture carries exif");
  const res = await upload(source, "image/jpeg", "photo.jpg");
  assert.equal(res.status, 201);
  const [url] = (await res.json()).files;
  const stored = fs.readFileSync(path.join(process.env.UPLOAD_DIR, path.basename(url)));
  const meta = await sharp(stored).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined);
});

test("valid PNG is accepted and undecodable files return 400", async () => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#fff" } }).png().toBuffer();
  assert.equal((await upload(png, "image/png", "ok.png")).status, 201);
  const truncated = png.subarray(0, 40);
  assert.equal((await upload(truncated, "image/png", "bad.png")).status, 400);
  const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("not an image at all")]);
  assert.equal((await upload(fakeJpeg, "image/jpeg", "bad.jpg")).status, 400);
});
