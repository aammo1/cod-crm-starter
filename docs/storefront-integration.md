# Intégration storefront v1 — contrat et guide agent

## Frontières et installation

Le CRM est la source de vérité pour catalogue, IDs/SKUs, variantes, images, prix,
frais, offres, stock et commandes. Le storefront possède présentation, panier,
interaction et consentement. Il appelle le CRM **depuis son serveur Node**, pas
depuis le navigateur. Il n’accède ni au SQLite ni aux routes privées CRM.

Copier `integrations/storefront-client.ts` dans le dépôt storefront, installer
`server-only`, conserver `import "server-only"` et adapter les imports. Le client
ne dépend pas du code interne CRM ; il utilise le fetch natif Node. Le CRM exige
Node 22+ pour SQLite ; le client seul fonctionne avec Node 20+.
Pour les handlers publics Next, copier aussi les fichiers listés dans
[`examples/nextjs/README.md`](../examples/nextjs/README.md), installer `server-only`
et `zod@^3`, adapter les chemins `app/`, `lib/` et imports au dépôt cible. Ce sont
des exemples à intégrer, pas une application storefront complète.

| Serveur | Variables runtime privées |
| --- | --- |
| CRM | `AUTH_SECRET` durable ; `CRM_PUBLIC_URL` origine canonique publique ; `STOREFRONT_API_KEY` nouvelle clé `openssl rand -hex 32` |
| Storefront | `CRM_BASE_URL` origine absolue du CRM ; `CRM_STOREFRONT_KEY` même valeur que la clé v1 CRM |
| Exemple Next | `STOREFRONT_ORIGIN` origine exacte du storefront ; `STOREFRONT_SESSION_SECRET` secret indépendant ≥32 caractères |

Aucune clé dans `NEXT_PUBLIC_*`, query strings, props client, logs, réponses
navigateur ou stockage navigateur. `CRM_BASE_URL` n’accepte ni chemin, query,
fragment, identifiants ni redirection. Le client exige HTTPS en production ; HTTP
hors production est limité à localhost/127.0.0.1/[::1]. Utiliser deux ports locaux
distincts pour CRM et storefront. Les médias doivent rester accessibles au
navigateur à l’origine `CRM_PUBLIC_URL` ; ne pas y mettre une adresse réseau privée.

## Auth et erreurs v1

Toutes les routes `/api/storefront/v1/*` exigent :

```http
Authorization: Bearer <STOREFRONT_API_KEY>
Accept: application/json
```

Pour POST, ajouter `Content-Type: application/json`. La clé est ≥32 caractères,
grammaire Bearer `[A-Za-z0-9._~+/-]` et éventuel padding `=` final (générer en hex
évite les ambiguïtés). Une configuration absente/invalide désactive v1 avec 503.
La clé ne donne aucun rôle admin/agent ni accès catalogue-agent. Les requêtes v1
avec `Origin` ou `Sec-Fetch-Site` sont refusées même avec la bonne clé. Ne pas
transférer les en-têtes entrants du navigateur ; aucune permission CORS.

Erreurs : `{ "error": { "code": "...", "message": "Message français" } }`.
Les réponses v1 ne doivent pas être mises en cache. Prévoir :

| Situation | Traitement |
| --- | --- |
| 400, `INVALID_REQUEST`, `INVALID_REQUEST_KEY`, `INVALID_UPSELL_VARIANT` | Corriger les entrées ; ne pas relancer aveuglément |
| 401, `UNAUTHORIZED` | Clé serveur invalide, pas une invitation à connecter le client au CRM |
| `INVALID_ORDER_TOKEN` | Liaison commande invalide : erreur 403 dans le service, actuellement convertie en **HTTP 401** par l’API v1 (également 401 pour token absent/trop long). Ne pas relancer avec une autre commande ou session |
| 403, `BROWSER_ACCESS_FORBIDDEN` | Corriger l’appel serveur/les en-têtes |
| 404 | Produit/variante indisponible ; rafraîchir le catalogue, ne pas inventer un ID |
| 409, `IDEMPOTENCY_CONFLICT` | Même clé avec autre requête canonique ; résoudre la tentative existante |
| 409, `UPSELL_CLOSED` | Offre fermée/expirée ou commande déjà traitée ; terminer l’offre |
| 409, `META_EVENT_CONFLICT` | Événement d’attribution déjà utilisé ; réconcilier, pas de nouvel ID pour contourner un résultat incertain |
| 413 | Corps trop grand (v1 : 32 Kio) |
| 429 | Respecter `Retry-After`, conserver la même tentative |
| Réseau/timeout/408/5xx | Résultat potentiellement commis : conserver exactement la clé et le corps pour reprise |
| 503, `TOKEN_SECRET_CHANGED` | Rotation `AUTH_SECRET` incompatible avec ancien replay ; intervention marchand, jamais nouvelle clé automatique |

Les budgets globaux/auth s’appliquent aussi aux replays. La recherche du reçu
précède seulement la lecture du catalogue courant et le quota **nouvelle commande
par téléphone**, pas l’authentification ou la validation syntaxique.

## Catalogue et médias

- `GET /api/storefront/v1/catalog?limit=50&cursor=...` →
  `{ products, nextCursor, settings: { storeName, currency: "MAD", shippingFeeMad, freeShippingThresholdMad } }`.
  Pagination stable par ID ; défaut 50, limite 1–100. Suivre `nextCursor` jusqu’à null.
- `GET /api/storefront/v1/catalog/[slug]` → `{ product }`, 404 si inactif/introuvable.

Voir les interfaces copiables `CatalogProduct`, `CatalogVariant`, `CatalogResponse`
dans le client. Produit : `id`, `slug`, `name`, `category`, `price`, `currency`,
`description`, `images`, `optionDefinitions`, `variants`, `isBestSeller`, `active`
et contenu facultatif `story`, `materials`, `badge`. Variante :
`{id,productId,sku,label,options:[{name,value}],images,active,available}`.
`available` est **booléen** : aucun décompte privé de stock, coût ou donnée agent.
Options arbitraires, toujours chaînes (`"XL"`, `"500 ml"`, `"36"`) ; sans options,
utiliser l’unique variante par défaut `options: []`, jamais un faux coloris/taille.
Les IDs/SKUs restent stables ; ne pas utiliser l’index d’un tableau comme identité.

Seuls produits/variantes actifs sont exposés, **y compris à disponibilité nulle**.
Une variante active avec `available: false` reste valide au checkout ; le stock
est vérifié/réservé à la confirmation CRM, pas à la création. Afficher honnêtement
la disponibilité et adapter l’UX, sans promettre de réservation au checkout.

Les images du catalogue et de l’offre sont des URLs absolues basées sur la
configuration `CRM_PUBLIC_URL` (pas sur Host). Le CRM autorise ses médias locaux
`/api/media/*` et `/images/*`, pas une URL externe arbitraire. Pour `next/image`,
ajouter l’hôte/protocole/port **exacts** dans `remotePatterns` :

```ts
images: { remotePatterns: [
  { protocol: "https", hostname: "crm.example", port: "", pathname: "/api/media/**", search: "" },
  { protocol: "https", hostname: "crm.example", port: "", pathname: "/images/**", search: "" }
] }
```

Adapter pour le port mock local. Ne pas copier un wildcard d’hôte et ne pas
transformer toutes les pannes réseau en 404 : seul un vrai 404 doit devenir
`notFound()`. Prévoir les états catalogue vide, erreur et chargement.

## Créer une commande sans prix client

`POST /api/storefront/v1/orders`, header `Idempotency-Key` de 8–128 caractères
`[A-Za-z0-9._:-]` (UUID recommandé pour une intégration serveur directe).

```json
{
  "customer": { "name": "Nom client", "phone": "0612345678" },
  "items": [{ "variantId": "ID_VARIANTE_CRM", "qty": 1 }]
}
```

Exactement deux champs checkout : nom (2–200 caractères après trim) et téléphone
marocain normalisé par le CRM. Panier : 1–50 lignes, quantité entière 1–10 **par
variante agrégée**. Schéma strict : aucun prix, frais, remise, ville ou adresse.
L’agent collecte adresse/ville à la confirmation. `meta` facultatif est décrit plus bas.

Première création 201, replay 200 :

```ts
{
  orderId: string,
  totals: { itemsSubtotal: number, shipping: number, total: number, currency: "MAD" },
  upsellOffer: null | {
    offerId: string, productId: string, name: string, image: string,
    originalPrice: number, upsellPrice: number, expiresAt: string,
    variants: {variantId: string, label: string, options: {name:string,value:string}[], available:boolean}[]
  },
  orderToken: string
}
```

Le CRM calcule les prix depuis le catalogue, les frais depuis les règles de la
boutique et persiste la commande, les snapshots, le reçu et les événements
durables applicables dans une transaction immédiate avant succès. Le checkout
ne confirme ni ne réserve le stock. La confirmation CRM ferme l’upsell, réserve
et enfile la soumission colis atomiquement.

Conserver **une clé et le même JSON complet** avant le premier envoi, y compris
l’attribution. Timeout/réponse perdue/redémarrage : reprendre avec cette même clé.
Le reçu durable renvoie les totaux/offre/délai d’origine, même après changement de
catalogue ou de paramètres ; ce n’est pas une lecture du statut courant de commande.
Le hash canonique utilise nom trimé, téléphone normalisé, variantes agrégées et
triées, attribution validée (URL réduite à origine/chemin), jamais les prix actuels.
Même clé avec requête canonique différente → 409. Ne pas supprimer les reçus ou
générer une nouvelle clé pour résoudre une création incertaine.

## Résoudre l’upsell

`POST /api/storefront/v1/orders/[orderId]/upsell` exige, en plus du Bearer :

```http
Idempotency-Key: <cle-stable-de-resolution>
X-Order-Token: <token-de-cette-commande>
```

Corps strict : `{ "action": "accept", "variantId": "VARIANTE_OFFRE" }` ou
`{ "action": "decline" }`. Réponse 200 :
`{orderId, upsellStatus, totals}` ; statut typé
`pending | accepted | declined | expired | closed`.

L’offre provient de l’`upsellRef` éligible, sinon d’un best seller disponible hors
panier. Désactivation ou absence de candidat → `upsellOffer: null`, offre fermée.
Le CRM impose le produit stocké, une variante marquée disponible dans l’offre,
exactement une unité, le prix remisé et les règles stockées. Ne pas envoyer
`offerId` ni un prix. Défauts : 20 s/−30 %, réglables dans leurs bornes ; afficher
`expiresAt`, pas un nouveau délai à chaque rendu/replay.

Le délai est contrôlé serveur ; une confirmation agent peut fermer l’offre avant
son échéance. Première résolution après fermeture/expiration → 409. Un **replay
de la même résolution déjà commise avec la même clé** renvoie son reçu après
fermeture ou modifications ultérieures. Une autre clé après résolution ne
bénéficie pas de ce replay et peut produire `UPSELL_CLOSED` ; une résolution
opposée ne peut pas modifier la commande. Ne pas essayer de contourner un 409.

Le token est lié à la commande par HMAC (`AUTH_SECRET` + nonce durable aléatoire)
et vérificateur ; ce n’est ni une session CRM ni un moyen d’authentification seul.
Le token n’a **pas de TTL autonome** dans v1 : l’offre possède son échéance, le
token reste nécessaire pour le replay de résolution. La DB ne stocke pas le
token en clair ; le checkout replay le reconstruit avec le secret émetteur.
`AUTH_SECRET` doit rester stable : sa rotation invalide anciens tokens et
replays checkout (`TOKEN_SECRET_CHANGED`), même longtemps après expiration de
l’offre. Il n’existe pas de keyring de rotation transparent. Prévoir maintenance,
réconciliation des tentatives ouvertes et traitement manuel des replays
historiques ; ne pas créer de commandes de remplacement automatiquement.

## Utiliser le client typé

```ts
import "server-only";
import { createStorefrontClient } from "./storefront-client";

const api = createStorefrontClient({
  baseUrl: process.env.CRM_BASE_URL!, apiKey: process.env.CRM_STOREFRONT_KEY!,
}); // construire au runtime côté serveur, pas dans un composant client
const catalog = await api.listCatalog({ limit: 50 });
const { product } = await api.getProduct("mon-produit");
// attemptKey et resolutionKey sont persistés avant le premier envoi.
const order = await api.createOrder(input, { idempotencyKey: attemptKey });
const resolved = await api.resolveUpsell(order.orderId, resolution, {
  idempotencyKey: resolutionKey, orderToken: order.orderToken,
});
```

Les quatre méthodes utilisent `cache: "no-store"`, refusent les redirections et
ne transfèrent aucun header navigateur. `timeoutMs` : 5000 par tentative par
défaut, configurable entier 1000–30000, **consommation du corps de réponse incluse**.
`maxRetries` : 1 par défaut, configurable 0–2. Relances : réseau/délai ou HTTP
408/429/500/502/503/504 uniquement ; même corps sérialisé, clé et token.
Attente exponentielle minimum 100 ms puis 200 ms, ou `Retry-After` si supérieur.
Un `Retry-After` de plus de 2 s est rendu à l’appelant sans attendre/relancer
automatiquement ; programmer la reprise sans changer de tentative.
Budget maximal : `(maxRetries + 1) × timeoutMs + maxRetries × 2 s` ; configurer le
délai du proxy/hébergeur en conséquence. Un timeout ne prouve jamais l’absence de
commit. `StorefrontError` expose `status` (0 transport/config), `code`, `retryable`,
`retryAfterSeconds`, `attempts`, et filtre messages/causes/URLs sensibles. Les DTO
sont typés, pas intégralement revalidés à la réponse ; les handlers publics restent
responsables de valider leurs entrées.

## Proxy navigateur Next : session et reprise exactes

L’exemple est un proxy à origine unique pour **un processus Node long-vivant**.
Toutes ses mutations exigent `Origin === STOREFRONT_ORIGIN` et, si fourni,
`Sec-Fetch-Site: same-origin`. Pas de confiance à Host/Referer/Bearer/IP entrants.

1. Attendre `PUT /api/checkout` avec JSON `{}` et vérifier le succès avant toute
   création. Cela initialise ou conserve la session cookie. Ne pas bootstrapper
   deux requêtes en parallèle avant réception du premier cookie.
2. Générer un UUID `attemptId` une fois et conserver le JSON avant envoi :
   `POST /api/checkout` avec `{attemptId, customer, items, attribution?}`. Le proxy
   répond 200 `{orderId, totals, upsellOffer}`, y compris pour un replay.
3. Pour l’offre, conserver un UUID `resolutionId` et envoyer
   `POST /api/checkout/upsell` avec
   `{checkoutAttemptId: attemptId, resolutionId, resolution: {action:"accept",variantId}}`
   ou `resolution: {action:"decline"}`. Aucun `orderId`/token navigateur accepté.
4. Réseau/délai/503/429 : reprendre le JSON conservé et les mêmes IDs, après
   `Retry-After`. Ne pas recalculer attribution/client/panier pendant une reprise.
   Un changement de requête est une nouvelle tentative seulement après résolution
   de la précédente. Sur 409 d’upsell, terminer l’offre.

Cookie AES-256-GCM authentifié et chiffré : session + liaison tentative/commande/
token, HttpOnly, SameSite=Strict, Path=/, sans Domain, Secure et nom `__Host-*` en
production. Durée **absolue d’une heure**, pas une heure glissante à chaque POST.
Le token ne sort pas en JSON, props ou localStorage. Les clés CRM sont des HMAC
de session/scope/UUID : deux navigateurs choisissant le même UUID ne partagent
pas le reçu. Le cookie initial permet la reprise si la réponse checkout et son
nouveau cookie sont perdus. Une seule liaison commande active par navigateur :
sérialiser les créations, les onglets peuvent remplacer la liaison active.

Expiration/suppression du cookie, changement d’origine ou rotation de
`STOREFRONT_SESSION_SECRET` perdent session/liaison/clés dérivées. **Ne pas
resoumettre une création incertaine dans une nouvelle session** : réconcilier
côté marchand. Pour durées longues ou multi-funnels, implémenter un stockage
serveur durable de sessions/tentatives avant de changer ces garanties.

Corps en flux : 16 Kio checkout, 2 Kio upsell, 16 octets bootstrap ; timeout de
lecture 5 s. Limiteur mémoire : 60/min global, 20/min/session, 20/min sans session,
map bornée à 1000. Pour serverless/multiworkers/réplicas/redémarrages fréquents,
remplacer par des compteurs atomiques partagés et des limites au reverse proxy.
Le Bearer caché et le contrôle Origin ne bloquent pas seuls un automate. Ne pas
considérer cet exemple mémoire comme une protection distribuée prête à l’emploi.

> **Attribution UTM : storefront intégré uniquement.** Le storefront du dépôt capture
> les paramètres UTM et les stocke sur la commande via ses routes `/api/store/*`.
> Le contrat v1 décrit ici n’a pas changé et n’accepte aucun champ UTM
> supplémentaire ; un storefront externe garde l’attribution originale ci-dessous.

## Attribution originale facultative

Sans consentement, omettre `meta`. Dans une intégration serveur de confiance,
`meta` est `{eventId,sourceUrl,fbp?,fbc?,clientIpAddress?,clientUserAgent?}` :
UUID événement stable par tentative, URL de la page storefront d’origine (pas
l’URL de connexion CRM), cookies Meta validés et bornés, IP réelle validée au
storefront, UA d’origine borné. Ne jamais déduire l’IP client depuis le socket
CRM ou recopier librement `X-Forwarded-For`. L’URL est réduite à origine/chemin
avant hash/persistance ; pas de query sensible. Conserver la même attribution
dans chaque retry. Réutiliser le même événement navigateur/serveur si un Pixel
externe est mis en place pour permettre la déduplication.

L’exemple public Next accepte seulement
`attribution: {consent:true,eventId,sourceUrl,fbp?,fbc?}` : URL à l’origine boutique,
schéma strict, **aucune IP/UA acceptée du navigateur ou transférée des headers**.
Il construit `meta` côté serveur après validation. Aucun Pixel n’est monté par
l’exemple ou le CRM. Meta reste optionnel : pas de dépendance à un compte pub pour
checkout ; l’outbox durable n’est alimentée que si le CRM est configuré.

## Prompt prêt à transmettre à un agent storefront

> Lis `docs/storefront-integration.md`, `integrations/storefront-client.ts` et
> `examples/nextjs/README.md` du CRM cible. Construis l’intégration dans le dépôt
> storefront, en copiant le client typé et en adaptant les exemples serveur, sans
> importer le SQLite ou les services internes du CRM. Le CRM est la source de
> vérité catalogue/variantes/images/prix/frais/offres/stock/commandes. Tous les
> secrets restent runtime serveur ; aucun NEXT_PUBLIC ni token en JSON navigateur.
> Préserve le design du magasin, les options génériques en chaînes, les IDs CRM
> stables et les prix MAD affichés depuis l’API. Checkout exactement nom/téléphone
> marocain, variantes/quantités seulement ; adresse/ville collectées par l’agent.
> Implémente les états vide/erreur/indisponible, pagination et médias canoniques avec
> Next Image à origine exacte. Initialise et attends la session avant checkout,
> persiste le même corps/UUID pour les retries, lie l’upsell au cookie et termine
> l’offre sur 409. Ne recrée jamais une tentative incertaine avec une nouvelle clé
> ou session. Garde le consentement et l’attribution d’origine stables. Documente
> les limites d’une heure/un funnel et remplace les compteurs mémoire avant un
> déploiement distribué. Vérifie auth, prix recalculés, zero-stock, reprise de
> réponse perdue, conflit, expiration et liaison inter-navigateurs avec un CRM mock
> jetable et des clés éphémères. Aucun appel transporteur ni donnée de production.

Dans ce dépôt, `node --test examples/nextjs/verify.test.mjs` exerce le client et
les handlers réels avec SQLite/médias temporaires et mock. Cette vérification ne
remplace pas le test d’intégration dans le véritable dépôt storefront.
