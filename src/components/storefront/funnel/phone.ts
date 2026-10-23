const MA_PHONE = /^(?:\+212|00212|212|0)([5-7]\d{8})$/;

/** Client-side convenience check. The server (normalizeMaPhone) is authoritative. */
export function normalizeMaPhoneClient(input: string): string | null {
  const match = MA_PHONE.exec(input.replace(/[\s.\-()]/g, ""));
  return match ? `0${match[1]}` : null;
}
