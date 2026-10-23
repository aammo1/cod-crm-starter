/**
 * Browser-safe Moroccan mobile normalizer. Must stay import-free: it is shared by
 * the storefront bundle and the server. Returns E.164 `+212XXXXXXXXX` or null.
 */
export function normalizeMaPhoneCore(raw: string): string | null {
  const ascii = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const cleaned = ascii.replace(/[\s .\-()/]/g, "");
  const m = cleaned.match(/^(?:\+212|00212|212)0?([67]\d{8})$/) ?? cleaned.match(/^0([67]\d{8})$/);
  return m ? `+212${m[1]}` : null;
}
