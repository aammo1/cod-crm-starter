import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LEN = 64;

// Stored format: scrypt$<saltHex>$<hashHex>
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_LEN) return false;
  const actual = scryptSync(password, salt, KEY_LEN);
  return timingSafeEqual(actual, expected);
}

let activeVerifications = 0;

export type PasswordCheck = "ok" | "mismatch" | "busy";

/** Fail fast under saturation; never build an unbounded hash-work queue. "busy" is not a mismatch. */
export async function verifyPasswordStatus(password: string, stored: string): Promise<PasswordCheck> {
  if (activeVerifications >= 4) return "busy";
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" ||
      !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) return "mismatch";
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  activeVerifications++;
  try {
    const actual = await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, KEY_LEN, (error, key) => error ? reject(error) : resolve(key));
    });
    return timingSafeEqual(actual, expected) ? "ok" : "mismatch";
  } finally { activeVerifications--; }
}

/** Boolean form: saturation reads as false. Login must use verifyPasswordStatus. */
export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  return (await verifyPasswordStatus(password, stored)) === "ok";
}
