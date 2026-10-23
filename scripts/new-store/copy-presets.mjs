// Default storefront copy per locale. The owner edits store.config.ts afterwards.
// Constraints mirror src/config/schema.ts (guarantees <= 4, trustBadges <= 4,
// announcement <= 5, seo description <= 160).

function clip(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

const fr = ({ name, city, niche }) => {
  const what = niche ? `nos ${niche}` : "nos produits";
  return {
    seoTitle: clip(`${name} - Livraison partout au Maroc`, 70),
    seoDescription: clip(
      `Découvrez ${what} chez ${name}. Livraison partout au Maroc et paiement à la livraison.`,
      160,
    ),
    announcement: ["Livraison partout au Maroc", "Paiement à la livraison"],
    hero: {
      title: `Bienvenue chez ${name}`,
      subtitle: niche
        ? `Une sélection de ${niche}, livrée chez vous partout au Maroc.`
        : "Des produits sélectionnés, livrés chez vous partout au Maroc.",
      ctaLabel: "Voir la boutique",
    },
    guarantees: [
      { icon: "truck", title: "Livraison partout au Maroc", text: "Nous livrons dans toutes les villes du Royaume." },
      { icon: "cash", title: "Paiement à la livraison", text: "Vous payez uniquement à la réception de votre colis." },
      { icon: "refresh", title: "Échange facile", text: "Un souci avec votre commande ? Nous l'échangeons simplement." },
    ],
    testimonials: [
      { name: "Salma", city: "Casablanca", text: "Livraison rapide et produit conforme. Je recommande.", rating: 5 },
      { name: "Youssef", city: "Rabat", text: "Service client réactif, très satisfait de mon achat.", rating: 5 },
      { name: "Imane", city: "Marrakech", text: "Bon rapport qualité-prix, colis bien emballé.", rating: 4 },
    ],
    faq: [
      { q: "Quels sont les délais de livraison ?", a: "La livraison prend généralement de 2 à 4 jours ouvrables." },
      { q: "Comment payer ma commande ?", a: "Le paiement se fait en espèces à la livraison." },
      { q: "Puis-je échanger un produit ?", a: "Oui, contactez-nous après réception pour organiser un échange." },
      { q: "Comment suivre ma commande ?", a: "Notre équipe vous appelle pour confirmer puis vous tient informé." },
    ],
    cta: {
      title: "Prêt à commander ?",
      text: "Passez commande en quelques secondes, payez à la livraison.",
      label: "Commander",
    },
    trustBadges: ["Paiement à la livraison", "Livraison partout au Maroc"],
    legal: {
      about: `${name} est une boutique en ligne marocaine basée à ${city}, qui propose des produits sélectionnés avec soin.`,
      shipping: "Livraison partout au Maroc sous 2 à 4 jours ouvrables. Paiement à la livraison.",
      terms: "Toute commande est confirmée par téléphone avant expédition. Le paiement se fait à la livraison.",
      privacy: "Nous utilisons votre nom et votre numéro de téléphone uniquement pour traiter votre commande.",
    },
  };
};

const ar = ({ name, city, niche }) => {
  const what = niche ? `${niche}` : "منتجاتنا";
  return {
    seoTitle: clip(`${name} - التوصيل لجميع مدن المغرب`, 70),
    seoDescription: clip(
      `اكتشفوا ${what} من ${name}. التوصيل لجميع مدن المغرب والدفع عند الاستلام.`,
      160,
    ),
    announcement: ["التوصيل لجميع مدن المغرب", "الدفع عند الاستلام"],
    hero: {
      title: `مرحبا بكم في ${name}`,
      subtitle: niche
        ? `تشكيلة مختارة من ${niche}، نوصلها إليكم في جميع مدن المغرب.`
        : "منتجات مختارة بعناية، نوصلها إليكم في جميع مدن المغرب.",
      ctaLabel: "تصفح المتجر",
    },
    guarantees: [
      { icon: "truck", title: "التوصيل لجميع مدن المغرب", text: "نوصل طلبكم إلى كل مدن المملكة." },
      { icon: "cash", title: "الدفع عند الاستلام", text: "لا تدفعون إلا عند استلام طلبكم." },
      { icon: "refresh", title: "استبدال سهل", text: "إذا واجهتم أي مشكل مع طلبكم، نستبدله لكم بسهولة." },
    ],
    testimonials: [
      { name: "سلمى", city: "الدار البيضاء", text: "توصيل سريع ومنتج مطابق للوصف. أنصح به.", rating: 5 },
      { name: "يوسف", city: "الرباط", text: "خدمة زبناء ممتازة وسريعة الاستجابة.", rating: 5 },
      { name: "إيمان", city: "مراكش", text: "جودة جيدة بثمن مناسب والطلب مغلف جيدا.", rating: 4 },
    ],
    faq: [
      { q: "ما هي مدة التوصيل؟", a: "يستغرق التوصيل عادة من 2 إلى 4 أيام عمل." },
      { q: "كيف أدفع ثمن طلبي؟", a: "الدفع نقدا عند الاستلام." },
      { q: "هل يمكنني استبدال المنتج؟", a: "نعم، تواصلوا معنا بعد الاستلام لتنظيم الاستبدال." },
      { q: "كيف أتتبع طلبي؟", a: "يتصل بكم فريقنا لتأكيد الطلب ثم يبقيكم على اطلاع." },
    ],
    cta: {
      title: "هل أنتم مستعدون للطلب؟",
      text: "اطلبوا في ثوان معدودة وادفعوا عند الاستلام.",
      label: "اطلب الآن",
    },
    trustBadges: ["الدفع عند الاستلام", "التوصيل لجميع مدن المغرب"],
    legal: {
      about: `${name} متجر إلكتروني مغربي يوجد مقره في ${city}، ويقدم منتجات مختارة بعناية.`,
      shipping: "التوصيل لجميع مدن المغرب خلال 2 إلى 4 أيام عمل. الدفع عند الاستلام.",
      terms: "يتم تأكيد كل طلب عبر الهاتف قبل الشحن. الدفع يتم عند الاستلام.",
      privacy: "نستعمل اسمكم ورقم هاتفكم فقط لمعالجة طلبكم.",
    },
  };
};

/** @param {"fr"|"ar"} locale @param {{name:string, city:string, niche?:string}} vars */
export function copyPresets(locale, vars) {
  return (locale === "ar" ? ar : fr)({ ...vars, niche: (vars.niche ?? "").trim() });
}
