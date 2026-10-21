/**
 * Slugify a color name for `?couleur=` URLs.
 * "Vert émeraude" -> "vert-emeraude"
 */
export function colorSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}