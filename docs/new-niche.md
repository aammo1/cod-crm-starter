# Lancer une nouvelle niche (environ une demi-journée)

Une niche = une copie du template = une application (boutique + CRM), une base
SQLite, un déploiement et des secrets propres. Ce guide va du dépôt vide à une
boutique vérifiée derrière Cloudflare. Les identifiants techniques restent en anglais.

## 1. Prérequis

- Node.js 22+, un compte GitHub, un accès Coolify (VPS), un compte Cloudflare.
- Le nom de domaine, le logo (PNG/JPG/SVG/WebP), la ville, le numéro WhatsApp.
- Facultatif au départ : identifiants Meta (Pixel ID + token) et TikTok (pixel code +
  token), accès Ozon Express (`OZON_CLIENT_ID`, `OZON_API_KEY`).

## 2. Créer le dépôt

Sur `aammo1/cod-crm-starter` : **Use this template → Create a new repository**, puis :

```sh
git clone <votre-copie> ma-niche && cd ma-niche
npm install
```

## 3. Lancer l’assistant

```sh
npm run new-store
```

Il demande : identité (nom, slug, domaine, langue `fr`/`ar`, niche, ville), contact
(WhatsApp, téléphone, email), marque (logo, couleurs principale/accent, style, arrondis,
image principale), catégories, suivi facultatif (Meta, TikTok), Ozon facultatif, et
le premier administrateur (email, nom, mot de passe de 12 à 128 caractères).

Il écrit : `store.config.ts`, les visuels traités dans `public/brand/`, `.env.local`
(mock, développement), `.env.production.example` (production), complète `.gitignore`
(`.env*`) et crée l’administrateur. Il vérifie le TypeScript et restaure l’ancien
`store.config.ts` en cas d’erreur.

Options :

- `--answers <fichier.json>` : mode non interactif (voir `examples/new-store-answers.json`).
- `--force` : écrase un `store.config.ts` déjà personnalisé et régénère `.env.local`.
- `--skip-user` : ne crée pas l’administrateur.
- `--root <dossier>` : dépôt cible (par défaut, celui du script).
- `--no-typecheck` : saute la vérification TypeScript.

> **Secrets** : `.env.production.example` contient de **vrais secrets générés**
> (`AUTH_SECRET`, `STOREFRONT_API_KEY`, `CATALOG_AGENT_KEY`) et, si saisis, vos tokens
> Meta/TikTok et vos identifiants Ozon, en clair. Le fichier est ignoré par git malgré
> son nom « example » : ne jamais le committer, l’envoyer ou le coller ailleurs que dans
> les variables d’environnement Coolify. Il fixe `DELIVERY_PROVIDER=ozon` : voir l’étape 10.

## 4. Personnaliser

- **Textes** : `store.config.ts` (héros, garanties, FAQ, avis, pages légales, annonces).
- **Section sur mesure** : créer un composant serveur dans `src/custom/`, l’enregistrer
  dans `src/custom/index.ts`, puis l’associer à un produit dans `customSections` de
  `store.config.ts` (détails dans `src/custom/README.md`).
- **Langue** : `locale: "fr"` ou `"ar"` (arabe, RTL) dans `store.config.ts`. La langue
  est fixée au build. Le CRM reste en français.
- Aperçu : `npm run dev` puis http://localhost:3000.

## 5. Produits

Dans `/admin` : nouveau produit → options (jusqu’à 3 axes, ex. taille, couleur) →
photos → stock d’ouverture dans `/crm/stock` → **packs** (ex. 1 = 199 MAD,
2 = 349 MAD, 3 = 449 MAD) et activation de la **page d’atterrissage** `/l/<slug>`
depuis la fiche produit. Le serveur calcule toujours les prix des packs ; la remise
est stockée comme remise fixe de la commande et un agent qui édite la commande la
conserve tant qu’il ne la change pas.

## 6. Paramètres

`/crm/parametres` : frais de livraison, seuil de livraison gratuite, upsell.

## 7. Équipe

`/crm/equipe` : créer les agents (rôle `agent`) et gérer leurs accès.

## 8. Déployer sur Coolify

1. Nouvelle ressource depuis le dépôt GitHub, build pack **Dockerfile**, port 3000.
2. Volume persistant sur `/app/data` (base, médias, sauvegardes et cache d’images).
3. Variables d’environnement : coller `.env.production.example`. Vérifier
   `CRM_PUBLIC_URL` et `SECURITY_ALLOWED_ORIGINS` (domaine public en `https://`),
   `DELIVERY_PROVIDER`, les tokens Meta/TikTok (`FACEBOOK_*`, `TIKTOK_*`) et les
   identifiants Ozon. `PORT` doit correspondre au port écouté (3000).
4. Health check : `/api/health`.
5. **Une seule réplique** (SQLite) ; pas de déploiement roulant.
6. Le build n’a pas besoin de base. Si l’administrateur n’a pas été créé sur la base de
   production : `node scripts/create-user.mjs <email> '<mot-de-passe>' '<nom>' admin`
   dans le conteneur.

## 9. Cloudflare

Voir [`docs/operations.md#cloudflare`](operations.md#cloudflare) : proxy orange, SSL
Full (strict), règles de cache. Laisser `SECURITY_TRUSTED_IP_HEADER` vide, sauf
chaîne de proxys garantissant l’IP visiteur dans `x-real-ip`/`x-forwarded-for`
(`CF-Connecting-IP` n’est pas supporté) ; sinon limites par IP et CAPI voient l’IP
du proxy/bord.

> **Budget JS** : marge faible (≈ 115,5 KiB sur `/produit/[slug]`, ≈ 117,5 KiB sur
> `/l/[slug]`, limite 120 KiB = 122 880 octets). Après tout ajout de code client,
> relancer `npm run build && npm run perf-budget`.
>
> **Limite connue** : une URL inexistante sous `/admin` ou `/crm` affiche la 404 dans la
> langue du storefront (`global-not-found`), alors que les pages qui appellent
> `notFound()` affichent la 404 française du CRM.
>
> **Limite connue** : `/merci` affiche les totaux de ligne sans remise avec le total
> serveur pour les commandes en pack (pas de ligne remise/livraison).

## 10. Vérifier

- **Fournisseur** : commencer avec `DELIVERY_PROVIDER=mock`, passer les commandes de
  test, puis basculer sur `ozon` sur une base propre (voir la section Ozon de
  [operations](operations.md)).
- **Commandes de test** : une via le catalogue (panier → nom et téléphone → upsell →
  `/merci`) et une via `/l/<slug>` (pack → formulaire → upsell → `/merci`) ; elles
  apparaissent dans `/crm/orders`, avec le total attendu.
- **Cache** : `curl -sI https://domaine/produit/<slug> | grep -i x-nextjs-cache` donne
  `HIT` ou `STALE` après la première visite.
- **Meta et TikTok** : envoyer des événements de test (codes de test) et vérifier un
  seul `Purchase` dédupliqué par plateforme dans les Events Managers.
- **Budget JS** : `DELIVERY_PROVIDER=mock npm run build && npm run perf-budget`.
- **PageSpeed mobile** (`/`, un produit, une landing) : noter les résultats dans
  [release-verification](release-verification.md).

## 11. Mise à jour du template

Les copies ne reçoivent aucune mise à jour automatique : voir
[`docs/template-upgrades.md`](template-upgrades.md).
