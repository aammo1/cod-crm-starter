# Connecter un storefront Next.js au CRM

Exemple App Router / Node.js, indépendant du design du magasin. Ces fichiers ne
montent aucune route dans le CRM. Le CRM reste propriétaire du catalogue, des
prix, des frais, des offres, du stock et des commandes. Le storefront possède
l’affichage, le panier, les deux champs nom/téléphone et le consentement.

## Installation et configuration

Copier en conservant cette structure (ou ajuster les imports relatifs) :

```text
integrations/storefront-client.ts
examples/nextjs/lib/{crm,checkout-session,checkout-input}.ts
examples/nextjs/app/api/checkout/route.ts
examples/nextjs/app/api/checkout/upsell/route.ts
examples/nextjs/app/catalog-example.tsx
```

Dans le storefront, placer les exemples `app/` dans son `app/` et `lib/` dans
son `lib/`, puis ajuster les imports vers le client copié. Dépendances :
`next`, `react`, `react-dom`, `zod` v3 et `server-only` (`npm install server-only zod@^3`).
Le client seul dépend uniquement de `server-only` et du `fetch` natif Node 20+.
Tous les imports du client doivent rester côté serveur ; les imports TypeScript
`import type` sont effacés et peuvent décrire des DTO navigateur sans exposer de clé.

Variables **serveur uniquement**, jamais `NEXT_PUBLIC_*` :

| Déploiement | Variable | Valeur |
| --- | --- | --- |
| CRM | `STOREFRONT_API_KEY` | clé aléatoire ≥32 caractères |
| CRM | `CRM_PUBLIC_URL` | origine canonique des médias du CRM |
| Storefront | `CRM_BASE_URL` | origine absolue du CRM, sans chemin/query/identifiants |
| Storefront | `CRM_STOREFRONT_KEY` | même clé que `STOREFRONT_API_KEY` |
| Storefront | `STOREFRONT_ORIGIN` | origine exacte de la boutique, p. ex. `https://boutique.example` |
| Storefront | `STOREFRONT_SESSION_SECRET` | secret indépendant aléatoire ≥32 caractères |

Exiger HTTPS en production. HTTP est accepté uniquement hors production sur
`localhost`, `127.0.0.1` ou `[::1]`. Configuration lue à la requête : aucun secret
ni accès DB au build. Ne jamais charger le fichier d’environnement du magasin source.

## Client serveur

```ts
const api = crm();
const page = await api.listCatalog({ limit: 50 });
const next = page.nextCursor
  ? await api.listCatalog({ cursor: page.nextCursor, limit: 50 }) : null;
const { product } = await api.getProduct("mon-produit");
```

`createOrder(input, {idempotencyKey})` et
`resolveUpsell(orderId, input, {idempotencyKey, orderToken})` sont réservés au
serveur. Les DTO publics contiennent des variantes génériques et une disponibilité
**booléenne**, sans soldes de stock. Les options restent des chaînes. Le prix
catalogue est en MAD entiers. Une variante active sans disponibilité reste valide
au checkout ; la confirmation CRM vérifie et réserve le stock.

Les quatre méthodes utilisent `cache: "no-store"` et refusent les redirections
(aucune fuite Bearer vers une autre origine). Délai par tentative : 5 s, réponse
comprise ; une relance automatique par défaut, configurable 0–2. Seuls problèmes
réseau/délai et HTTP 408/429/500/502/503/504 sont relancés. Corps sérialisé, clé et
token restent identiques. Les autres 4xx ne sont pas relancés. `Retry-After`
(secondes ou date) est respecté ; s’il dépasse 2 s, le client rend immédiatement
l’erreur pour laisser le consommateur programmer la reprise. Durée totale bornée :
au plus `(maxRetries + 1) × timeoutMs + maxRetries × 2 s`.

`StorefrontError` fournit `status` (0 pour transport/configuration), `code`,
`retryable`, `retryAfterSeconds`, `attempts`. Messages/codes inconnus et causes
transport sont filtrés : aucune URL, clé, donnée client ou réponse brute dans
l’erreur. Ne pas journaliser les paramètres ni les cookies. Le client expose les
DTO typés de l’API de confiance ; la validation des entrées publiques appartient
aux handlers, celle des prix et variantes appartient toujours au CRM.

## Contrat public exact des exemples

Toutes les mutations exigent `Origin === STOREFRONT_ORIGIN`, y compris en local.
`Sec-Fetch-Site`, si présent, doit être `same-origin`. Pas de CORS. Aucun accès
n’est accordé à partir de `Host`, `Referer`, d’en-têtes IP ou de clé Bearer reçue.
Utiliser des fetch relatifs avec `credentials: "same-origin"`.

1. À l’ouverture du funnel, appeler **et attendre** `PUT /api/checkout`, JSON `{}`.
   Il initialise ou conserve un cookie de session HttpOnly. Ne pas lancer deux
   initialisations concurrentes avant réception du premier cookie.
2. Créer un UUID `attemptId` une seule fois par tentative. Sauvegarder **le même
   JSON complet** dans `sessionStorage` avant l’envoi. Envoyer
   `POST /api/checkout` :

   ```json
   {
     "attemptId": "UUID-DE-LA-TENTATIVE",
     "customer": { "name": "Nom client", "phone": "0612345678" },
     "items": [{ "variantId": "ID-CRM", "qty": 1 }]
   }
   ```

   Réponse 200 : `{orderId, totals, upsellOffer}` (aussi pour un replay).
   Le proxy ne permet ni prix, ni adresse, ni URL arbitraire, ni token, ni ordre
   cible. Objets stricts ; quantités agrégées ≤10/variante, 1–50 lignes,
   noms et téléphones marocains validés. Limite 16 Kio en flux et délai corps 5 s.
   Sur erreur réseau/timeout/503/429, reprendre avec **le même attemptId et le
   même corps**, en respectant `Retry-After`. Un changement du panier/client ou
   du contexte d’attribution constitue une nouvelle tentative, après avoir résolu
   toute création incertaine. Un même ID avec un autre corps renvoie 409.
3. Pour l’offre, créer une fois un UUID `resolutionId`, conserver le JSON puis
   envoyer `POST /api/checkout/upsell` :

   ```json
   {
     "checkoutAttemptId": "UUID-DE-LA-TENTATIVE",
     "resolutionId": "UUID-DE-LA-RESOLUTION",
     "resolution": { "action": "accept", "variantId": "VARIANTE-DE-L-OFFRE" }
   }
   ```

   Ou `resolution: {"action":"decline"}`. Limite 2 Kio. Reprendre avec le même
   JSON et ID de résolution. Le CRM impose le produit offert, une unité, le prix
   et l’échéance serveur, et conserve les replays après résolution. Une réponse
   409 clôt le parcours d’offre ; ne pas générer des clés pour la contourner.

Exemple navigateur minimal (à intégrer au contrôleur de funnel existant) :

```js
await fetch('/api/checkout', {
  method: 'PUT', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' }, body: '{}'
}); // vérifier response.ok avant de continuer
const attempt = { attemptId: crypto.randomUUID(), customer, items };
sessionStorage.setItem('checkout-pending', JSON.stringify(attempt));
// Reprise : relire checkout-pending, ne pas recréer le UUID ni les valeurs.
const response = await fetch('/api/checkout', {
  method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: sessionStorage.getItem('checkout-pending')
});
```

Les clés CRM sont des HMAC de la session, du scope et de l’ID de tentative : deux
navigateurs choisissant le même UUID ne peuvent pas rejouer la commande de l’autre.
Le cookie AES-256-GCM **authentifié et chiffré** lie l’ID CRM, son token et la tentative
au navigateur. `HttpOnly; SameSite=Strict; Secure` en production, nom `__Host-*`,
sans Domain, Path `/`, validité absolue 1 h. Le token n’est jamais renvoyé en JSON.
L’upsell prend l’ordre et son token dans ce cookie uniquement et vérifie la
tentative ; aucun `orderId` fourni par le navigateur n’est accepté. Les reprises
checkout fonctionnent même si la réponse portant le cookie d’ordre a été perdue,
grâce au cookie initial et à la clé stable. Un seul funnel actif par navigateur :
sérialiser les créations, les onglets peuvent remplacer la liaison d’ordre active.

Conserver les secrets stables pendant les reprises. Rotation du secret de session,
suppression/expiration du cookie ou changement d’origine perdent cette liaison :
**ne pas resoumettre automatiquement une création incertaine avec une nouvelle
session/clé** ; réconcilier côté marchand. La rotation de `AUTH_SECRET` du CRM
invalide aussi ses tokens/replays dérivés ; garder le secret émetteur pour les
commandes ouvertes. Pour des reprises longues/multi-funnels, remplacer le cookie
d’ordre par un stockage serveur durable avec sessions et tentatives persistées.

### Limitation d’abus et déploiement

Le helper applique avant la lecture du corps 60 requêtes/minute globalement,
20/minute/session et 20 initialisations sans session/minute. Les entrées expirent
et la map est bornée à 1000. Les nouveaux cookies ne contournent pas le plafond
global. Le CRM ajoute ses budgets globaux et par téléphone ; les replays passent
avant le quota de nouvelles commandes par téléphone.

Sans en-tête IP de confiance, ce limiteur n’a que des compteurs **globaux** (et par
session) : un client abusif peut consommer le plafond de 60 requêtes/minute pour tous
les visiteurs. Appliquer donc une limitation de débit par IP au reverse proxy ou à
la périphérie (en n’utilisant que l’IP authentifiée par l’hébergeur) ; c’est la
protection recommandée, le limiteur de l’exemple n’en est que le dernier filet.

Ce limiteur fonctionne pour **un processus Node long-vivant**. Avant un déploiement
serverless, plusieurs workers/réplicas ou des redémarrages fréquents, le remplacer
par des compteurs atomiques partagés (p. ex. Redis) et appliquer au reverse proxy
une limite de requêtes/connexions/corps. Ajouter si nécessaire une limite IP à la
périphérie selon l’IP authentifiée par l’hébergeur. Ne jamais faire confiance à un
`X-Forwarded-For` transmis librement par l’appelant. Ni Bearer CRM, ni contrôle
d’origine ne constituent à eux seuls une protection contre un client automatisé.

### Attribution facultative

Par défaut, aucun `meta` n’est envoyé. Après consentement, le navigateur peut
ajouter `attribution: {consent:true,eventId,sourceUrl,fbp?,fbc?}`. Le schéma est
strict ; `eventId` est un UUID stable par tentative, les cookies Meta sont bornés,
`sourceUrl` doit appartenir à l’origine boutique et est réduit à origine/chemin.
Ne pas envoyer d’attribution si le consentement est refusé. Les en-têtes
`User-Agent`/IP et tous les en-têtes entrants ne sont jamais transférés au CRM.
Le client serveur typé permet une IP/UA explicitement validée par une autre
intégration de confiance, mais ce proxy ne les accepte pas du navigateur.
L’outbox Meta reste facultative côté CRM ; cet exemple ne monte aucun Pixel.

## Catalogue RSC et médias

Importer `CatalogExample` depuis une page serveur. Prévoir dans la page
`export const dynamic = "force-dynamic"` si nécessaire et son traitement d’erreur
via `error.tsx`. Aucun token/clé ne doit passer en props client. L’exemple affiche
les vrais prix API, les options génériques et les indisponibilités ; le panier
consommateur conserve seulement variantes/quantités. Pour `next/image`, autoriser
**l’origine CRM_PUBLIC_URL exacte** dans `next.config.ts`, par exemple :

```ts
images: { remotePatterns: [
  { protocol: 'https', hostname: 'crm.example', port: '', pathname: '/api/media/**', search: '' },
  { protocol: 'https', hostname: 'crm.example', port: '', pathname: '/images/**', search: '' }
] }
```

Pas de wildcard d’hôte. Adapter protocole/port pour le mock local. Les URLs
d’images sont déjà canoniques dans les DTO CRM ; ne pas les reconstruire à partir
de l’hôte appelant. Paginer avec `nextCursor` pour les grandes collections.

## Vérification exécutable dans ce dépôt

```sh
node --test examples/nextjs/verify.test.mjs
npm run lint
npx tsc --noEmit
```

Le test démarre un serveur HTTP local éphémère qui appelle les **vrais handlers v1**,
avec SQLite/médias temporaires, clés éphémères et `DELIVERY_PROVIDER=mock`, puis
exécute le client et les handlers Next publics. Aucun environnement source chargé,
aucun transporteur appelé. Il couvre catalogue, auth, replays après commit/réponse
perdue, conflits, timeout/retry, confidentialité et liaison session/upsell.
Les exemples restent compilables avec le tsconfig actuel, sans alias privé ni
changement de configuration de release.
