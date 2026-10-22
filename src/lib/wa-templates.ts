// Hand-editable WhatsApp message templates (French, Darija-friendly).
// Placeholders: {nom}, {produits}, {total}, {ville}, {suivi}, {boutique}.

export type WaTemplateKey = "confirmation" | "rappel" | "expedition";

export interface WaTemplateVars {
  nom?: string;
  produits?: string;
  total?: string;
  ville?: string;
  suivi?: string;
  /** Store name from settings; defaults to « Votre boutique ». */
  boutique?: string;
}

export const WA_TEMPLATES: Record<WaTemplateKey, string> = {
  confirmation:
    "Bonjour {nom} 👋\n\nMerci pour votre commande !\n\nVotre commande :\n{produits}\n\nTotal à payer à la livraison : {total}\n\nPour l'expédier rapidement, pouvez-vous nous confirmer votre adresse de livraison et votre ville ?\n\nMerci pour votre confiance 💛\n— {boutique}",
  rappel:
    "Bonjour {nom} 👋\n\nNous avons essayé de vous joindre au sujet de votre commande {produits} ({total}).\n\nQuand serait-il plus pratique de vous rappeler ?\n\n— {boutique}",
  expedition:
    "Bonjour {nom} 👋\n\nBonne nouvelle : votre commande {produits} a été expédiée 📦\n\nNuméro de suivi : {suivi}\n\nLa livraison prend 24 à 48h et le livreur vous appellera avant d'arriver.\n\n— {boutique}",
};

// Expedition variant used while no tracking number exists yet.
export const WA_TEMPLATES_EXPEDITION_SANS_SUIVI =
  "Bonjour {nom} 👋\n\nBonne nouvelle : votre commande {produits} a été expédiée 📦\n\nLa livraison prend 24 à 48h et le livreur vous appellera avant d'arriver.\n\n— {boutique}";

function fillTemplate(template: string, vars: WaTemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key as keyof WaTemplateVars];
    return value && value.trim() !== "" ? value : match;
  });
}

export function buildWaMessage(
  templateKey: WaTemplateKey,
  vars: WaTemplateVars,
): string {
  const template =
    templateKey === "expedition" &&
    (!vars.suivi || vars.suivi.trim() === "")
      ? WA_TEMPLATES_EXPEDITION_SANS_SUIVI
      : WA_TEMPLATES[templateKey];
  return fillTemplate(template, { ...vars, boutique: vars.boutique?.trim() || "Votre boutique" });
}

export function buildWaLink(
  phone: string,
  templateKey: WaTemplateKey,
  vars: WaTemplateVars,
): string {
  const digits = phone.replace(/\D/g, "");
  const text = buildWaMessage(templateKey, vars);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
