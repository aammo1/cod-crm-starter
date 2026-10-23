export type Locale = "fr" | "ar";

const fr = {
  addToCart: "Ajouter au panier", orderNow: "Commander maintenant", soldOut: "Épuisé",
  cart: "Panier", cartEmpty: "Votre panier est vide", subtotal: "Sous-total", shipping: "Livraison",
  freeShipping: "Livraison gratuite", total: "Total", checkout: "Commander",
  freeShippingProgress: "Plus que {amount} pour la livraison gratuite",
  fullName: "Nom complet", phone: "Téléphone", phonePlaceholder: "06 XX XX XX XX",
  phoneInvalid: "Numéro marocain invalide", nameRequired: "Votre nom est requis",
  cod: "Paiement à la livraison", confirmOrder: "Confirmer la commande", sending: "Envoi…",
  upsellTitle: "Offre spéciale pour vous", upsellAccept: "Oui, ajouter", upsellDecline: "Non merci",
  upsellEndsIn: "Se termine dans {s}s", thankYouTitle: "Merci pour votre commande !",
  thankYouText: "Notre équipe vous appelle pour confirmer votre commande.",
  orderNumber: "N° de commande", contactWhatsapp: "Nous contacter sur WhatsApp",
  chooseOption: "Choisir {name}", quantity: "Quantité", packs: "Choisissez votre offre",
  pieces: "{n} pièce(s)", save: "Économisez {amount}", bestValue: "Meilleure offre",
  differentOptions: "Choisir des options différentes", unit: "Article {n}",
  home: "Accueil", shop: "Boutique", about: "À propos", contact: "Contact",
  shippingReturns: "Livraison & retours", terms: "CGV", privacy: "Confidentialité",
  faq: "Questions fréquentes", reviews: "Avis clients", bestSellers: "Meilleures ventes",
  youMayLike: "Vous aimerez aussi", genericError: "Une erreur est survenue, réessayez.",
  retryLater: "Trop de tentatives, réessayez dans un instant.",
} as const;

const ar: Record<keyof typeof fr, string> = {
  addToCart: "أضف إلى السلة", orderNow: "اطلب الآن", soldOut: "نفدت الكمية",
  cart: "السلة", cartEmpty: "سلتك فارغة", subtotal: "المجموع الفرعي", shipping: "التوصيل",
  freeShipping: "توصيل مجاني", total: "المجموع", checkout: "اطلب",
  freeShippingProgress: "بقي {amount} للحصول على التوصيل المجاني",
  fullName: "الاسم الكامل", phone: "رقم الهاتف", phonePlaceholder: "06 XX XX XX XX",
  phoneInvalid: "رقم هاتف مغربي غير صالح", nameRequired: "الاسم مطلوب",
  cod: "الدفع عند الاستلام", confirmOrder: "تأكيد الطلب", sending: "جارٍ الإرسال…",
  upsellTitle: "عرض خاص لك", upsellAccept: "نعم، أضف", upsellDecline: "لا شكرا",
  upsellEndsIn: "ينتهي خلال {s} ثانية", thankYouTitle: "شكرا على طلبك!",
  thankYouText: "سيتصل بك فريقنا لتأكيد طلبك.",
  orderNumber: "رقم الطلب", contactWhatsapp: "تواصل معنا عبر واتساب",
  chooseOption: "اختر {name}", quantity: "الكمية", packs: "اختر عرضك",
  pieces: "{n} قطعة", save: "وفّر {amount}", bestValue: "أفضل عرض",
  differentOptions: "اختيار خيارات مختلفة", unit: "المنتج {n}",
  home: "الرئيسية", shop: "المتجر", about: "من نحن", contact: "اتصل بنا",
  shippingReturns: "التوصيل والإرجاع", terms: "شروط البيع", privacy: "الخصوصية",
  faq: "الأسئلة الشائعة", reviews: "آراء الزبناء", bestSellers: "الأكثر مبيعا",
  youMayLike: "قد يعجبك أيضا", genericError: "حدث خطأ، حاول مرة أخرى.",
  retryLater: "محاولات كثيرة، حاول بعد قليل.",
};

export const UI_STRINGS = { fr, ar } as const satisfies Record<Locale, Record<keyof typeof fr, string>>;

export type UiKey = keyof typeof UI_STRINGS.fr;

export function t(locale: Locale, key: UiKey, vars?: Record<string, string | number>): string {
  let s: string = UI_STRINGS[locale][key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Integer MAD price: "199 DH" (fr) or "199 درهم" (ar). */
export function formatPrice(locale: Locale, n: number): string {
  return `${n} ${locale === "ar" ? "درهم" : "DH"}`;
}
