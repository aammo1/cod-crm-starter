// new-store:template
import type { StoreConfigInput } from "@/config/schema";

export default {
  slug: "ma-boutique",
  name: "Ma Boutique",
  domain: "http://localhost:3000",
  locale: "fr",
  brand: {
    logo: "/brand/logo.webp",
    logoWidth: 120,
    logoHeight: 40,
    colors: {
      primary: "#1f2937",
      primaryForeground: "#ffffff",
      accent: "#d97706",
      accentForeground: "#111827", // white on this accent is only 3.2:1; dark text is 5.6:1
      background: "#ffffff",
      foreground: "#111827",
      muted: "#f3f4f6",
      border: "#e5e7eb",
    },
    fonts: { heading: "playfair", body: "inter" },
    radius: "md",
  },
  contact: {
    whatsapp: "212600000000",
    phone: "06 00 00 00 00",
    email: "contact@example.ma",
    city: "Casablanca",
    hours: "Lun-Sam, 9h-18h",
  },
  seo: {
    title: "Ma Boutique - Livraison partout au Maroc",
    description: "Découvrez nos produits avec livraison partout au Maroc et paiement à la livraison.",
  },
  announcement: ["Livraison partout au Maroc", "Paiement à la livraison"],
  nav: {
    categories: [{ slug: "nouveautes", label: "Nouveautés" }],
  },
  home: {
    sections: ["hero", "categories", "bestSellers", "guarantees", "testimonials", "faq", "cta"],
    hero: {
      title: "Bienvenue chez Ma Boutique",
      subtitle: "Des produits sélectionnés, livrés chez vous partout au Maroc.",
      image: "/brand/logo.webp",
      ctaLabel: "Voir la boutique",
      ctaHref: "/boutique",
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
      href: "/boutique",
    },
  },
  product: {
    trustBadges: ["Paiement à la livraison", "Livraison partout au Maroc"],
    reviews: [],
    sizeGuides: {},
  },
  landing: { stickyCta: true, index: false },
  leads: { enabled: false },
  legal: {
    about: "Ma Boutique est une boutique en ligne marocaine proposant des produits sélectionnés avec soin.",
    shipping: "Livraison partout au Maroc sous 2 à 4 jours ouvrables. Paiement à la livraison.",
    terms: "Toute commande est confirmée par téléphone avant expédition. Le paiement se fait à la livraison.",
    privacy: "Nous utilisons votre nom et votre numéro de téléphone uniquement pour traiter votre commande.",
  },
  tracking: {},
  customSections: {},
} satisfies StoreConfigInput;
