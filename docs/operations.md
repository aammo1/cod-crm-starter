# Installation et opérations

## Isolation et stockage

Une boutique = un dépôt, une instance Node long-vivante, un SQLite local, un
répertoire de médias, une équipe et des secrets indépendants. Ne pas monter le
même volume dans plusieurs CRM, ni placer SQLite sur un stockage réseau ou
éphémère. Ne jamais copier la base ou les identifiants d’une autre boutique.
Les migrations SQL sont appliquées automatiquement à la première ouverture et
enregistrées dans `_migrations`. Aucun seed de produits/utilisateurs/commandes,
aucune initialisation SQLite au build. Le premier admin est une action explicite.

## Configuration runtime

`.env.example` est le contrat de configuration ; Next charge `.env.local`, tandis
que Compose lit `.env` (ou `--env-file`). Les scripts `create-user.mjs` et
`backup-db.mjs` ne chargent aucun fichier env : exporter `DB_PATH`, ou les lancer
dans le conteneur déjà configuré. Ne pas afficher `docker compose config` avec
les secrets résolus ; utiliser `config --quiet`.

| Variable CRM | Usage |
| --- | --- |
| `DB_PATH` | `./data/crm.db` hors conteneur ; `/app/data/crm.db` dans Compose |
| `UPLOAD_DIR` | Par défaut `uploads` à côté du DB ; Compose fixe `/app/data/uploads` |
| `AUTH_SECRET` | Générer `openssl rand -base64 32`, conserver stable et sauvegarder séparément |
| `CRM_PUBLIC_URL` | Origine canonique publique des médias, sans chemin/query ni identifiants ; HTTPS en production |
| `STOREFRONT_API_KEY` | `openssl rand -hex 32`, ≥32 caractères ; absent/invalide désactive v1 (503) |
| `SECURITY_ALLOWED_ORIGINS` | Liste séparée par virgules d’origines navigateur CRM exactes, protocole et port inclus ; sans wildcard |
| `SECURITY_TRUSTED_IP_HEADER` | Vide par défaut ; seules valeurs acceptées : `x-real-ip` ou `x-forwarded-for` (dernier saut) ; `CF-Connecting-IP` n’est **pas** supporté (ignoré). Opt-in uniquement derrière un proxy maîtrisé |
| `DELIVERY_PROVIDER` | Garder `mock` ; **seule cette valeur exacte** sélectionne le mock dans le code. Sans variable, le code utilise Ozon. Image/Compose/exemple fixent mock par défaut |
| `OZON_CLIENT_ID`, `OZON_API_KEY` | Identifiants propres au compte de cette boutique, inutiles pour mock |
| `OZON_BASE_URL` | `https://api.ozonexpress.ma` par défaut |
| `OZON_USE_CUSTOM_TRACKING` | `0` par défaut ; activer seulement après validation du compte/provider |
| `OZON_SUBMIT_INTERVAL_SEC` | 15 s par défaut, minimum 5 s |
| `OZON_POLL_INTERVAL_MIN` | 30 min par défaut, minimum 5 min |
| `OZON_TRACK_BATCH` | 25 par défaut |
| `CATALOG_AGENT_KEY` | Secret dédié ≥32 caractères ; vide désactive l’API catalogue automatisée |
| `FACEBOOK_PIXEL_ID`, `FACEBOOK_ACCESS_TOKEN` | Meta serveur facultatif, désactivé sans ID numérique et token ; le CRM n’y monte aucun Pixel ; les Pixels navigateur du storefront viennent des identifiants de `store.config.ts` et sont dédupliqués avec les événements serveur par ID d’événement |
| `FACEBOOK_TEST_EVENT_CODE`, `FACEBOOK_API_VERSION` | Code test facultatif et version Graph (`v22.0` par défaut) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Assistant lecture seule facultatif ; clé vide le laisse indisponible, modèle par défaut dans `.env.example` |

La clé storefront donne accès aux seules routes v1, pas à l’administration ou
aux sessions Auth.js. La clé catalogue est distincte. Ne jamais exposer ces clés
en `NEXT_PUBLIC_*`, URL, logs, captures ou JSON de paramètres.
`CRM_PUBLIC_URL` ne remplace pas l’allowlist des mutations navigateur.
Le storefront appelle v1 côté serveur : ne pas ajouter son origine à l’allowlist
CRM pour contourner cette frontière. Son propre proxy contrôle son origine.

Ne faire confiance à une IP transférée que si le reverse proxy écrase
`x-real-ip` ou garantit le dernier hop de `x-forwarded-for`, et si l’accès direct
au service est bloqué. Sans cela, laisser `SECURITY_TRUSTED_IP_HEADER` vide ; les
budgets globaux/compte/téléphone restent actifs. Configurer aussi les limites de
corps, connexions et débit au proxy. Ne pas dériver des permissions du `Host`
fourni par l’appelant.

## Déploiement Docker

Suivre les commandes du [README](../README.md), avec un `-p` unique et un fichier
env privé par boutique. Compose fournit `crm` sur `127.0.0.1:3000` et un volume
`<projet>_crm-data:/app/data`. Pour plusieurs boutiques sur une machine, donner
un port hôte distinct à chacune via `docker-compose.local.yml` (ignoré), chargé
explicitement avec `-f docker-compose.yml -f docker-compose.local.yml`.
Ne pas utiliser `down -v` sur une installation à conserver.

Le Dockerfile utilise Node 22 Alpine pour tous les stages. `better-sqlite3` 13
fournit les bindings musl ; un test `:memory:` vérifie le binding avant le build.
`npm ci --ignore-scripts` conserve ce mode précompilé ; réévaluer cette décision
si une dépendance commence à nécessiter une compilation/install script. Le
tracing Next inclut migrations et prebuilds ; l’image copie aussi le package
SQLite complet pour les outils CLI. Ne pas mélanger un module natif compilé sur
une autre version Node/libc avec cette image.

Le runner est nonroot UID/GID **1001:1001**, écoute sur `0.0.0.0:3000`, et ne
modifie que les données et le cache Next prévus. Un volume nommé neuf récupère
les permissions du répertoire de l’image. Un bind mount ou volume ancien doit
être préparé par l’administrateur pour UID/GID 1001, y compris DB/WAL/uploads/
backups. Vérifier les droits avant démarrage ; ne pas passer le service en root
pour masquer une erreur de permissions.

Reverse proxy : HTTPS public, port interne 3000, origine CRM exacte dans les
variables, en-têtes forwarding maîtrisés. En Coolify, utiliser une ressource
Dockerfile pour ce CRM, port 3000, stockage persistant dédié `/app/data`, secrets
runtime et domaine HTTPS. Utiliser le déploiement à instance unique avec arrêt
de l’ancien processus avant remplacement ; pas de déploiement roulant qui fait
tourner deux owners SQLite/workers. Le storefront est une autre ressource avec
ses secrets serveur propres. Aucune base PostgreSQL/Redis n’est requise par le CRM.

## Santé et surveillance

`GET /api/health` ouvre/vérifie la DB, renvoie 200 avec `status: "ok"`, `db: true`,
`workers.{submission,tracking,meta}.{enabled,lastTickAt?}` et les compteurs
`queues.{submissionsQueued,submissionsNeedsReview,submissionsFailed}` ; erreur DB →
503. Le healthcheck Docker teste cette URL sur `127.0.0.1`, délai initial 60 s.
Il ne valide ni les identifiants Ozon, ni la fraîcheur des heartbeats, ni la
livraison effective. Surveiller séparément les ticks absents/périmés et les files
en échec/revue. Un tick indique une boucle exécutée, pas un appel provider réussi.
Les workers démarrent via l’instrumentation Node : soumission, tracking, Meta
facultatif et synchronisation des villes. Garder le processus long-vivant.

Le mock est en mémoire par processus : la DB persiste après redémarrage, mais les
faux colis du provider ne persistent pas. Utiliser une installation jetable pour
les parcours mock, sans considérer ceux-ci comme un historique transporteur réel.

## Premier admin et récupération d’accès

```sh
docker compose --env-file .env -p ma-boutique exec crm node scripts/create-user.mjs admin@example.test '<mot-de-passe-unique-12-a-128-caracteres>' 'Administrateur' admin
```

Le script doit être lancé depuis `/app` dans l’image ou depuis la racine du dépôt
en local pour trouver `migrations/`. Il crée le schéma frais si nécessaire, puis
crée **ou met à jour** l’email normalisé : mot de passe scrypt, nom, rôle,
réactivation et incrément de version de session pour un compte existant. Le rôle
`agent` fonctionne de la même façon ; l’admin gère ensuite l’équipe dans `/crm/equipe`.
Le mot de passe est de 12 à 128 caractères. Ne pas l’enregistrer dans les docs ou
les scripts de déploiement ; utiliser un terminal privé sans historique sensible.

## Sauvegarde et restauration vérifiée

```sh
# Local, avec DB_PATH exporté si différent du défaut :
npm run backup
# Conteneur (le package.json standalone ne garantit pas le script npm) :
docker compose --env-file .env -p ma-boutique exec crm node scripts/backup-db.mjs
```

Le script refuse une DB absente, ouvre la source existante en lecture seule et
utilise l’API de backup SQLite pour produire un snapshot cohérent même avec WAL.
Avant toute écriture du snapshot, il impose un umask `077`, crée ou restreint le
répertoire `backups/` à `0700`, puis réserve exclusivement le fichier à `0600`.
Ces droits sont réservés au propriétaire, même si l’umask appelant est `022` ;
un répertoire existant doit donc appartenir à l’utilisateur qui lance le script.
Dans Docker, ce propriétaire est UID 1001. Le parent `/app/data` reste un volume
de travail pour DB/uploads ; ses droits ne constituent pas la frontière privée
des sauvegardes : `backups/` et les nouveaux snapshots ont leurs propres droits
restrictifs. Ne pas partager ce volume avec des utilisateurs non autorisés ; root
et les administrateurs de l’hôte restent capables d’accéder aux données. Les anciens
snapshots déjà créés ne sont pas chmodés par le script : corriger leurs droits
avant de les copier hors du répertoire privé.
Les 14 derniers **fichiers `crm-*.db`** sont conservés dans `backups/` à côté de
la DB (donc `/app/data/backups` en Compose). Ce n’est pas un planificateur :
programmer la commande quotidiennement et surveiller son code de sortie. Il ne
sauvegarde ni médias, ni secrets, ni fichiers d’autres préfixes. Une sauvegarde
locale seule ne protège pas contre la perte du disque/volume : copier les DB,
les uploads et les secrets chiffrés vers une destination hors hôte avec rétention
indépendante et accès limité. Pour un point de restauration DB+médias commun,
mettre les écritures en maintenance et arrêter le CRM pendant leur capture.
Ne pas copier seulement `crm.db` à chaud en ignorant son WAL.

Exemple de contrôle d’un snapshot (chemin à adapter, ne modifie pas la source) :

```sh
DB_PATH=/chemin/backup/crm-snapshot.db node --input-type=module -e 'import Database from "better-sqlite3"; const db=new Database(process.env.DB_PATH,{readonly:true,fileMustExist:true}); const result=db.pragma("integrity_check"); if(result.length!==1 || result[0].integrity_check!=="ok" || db.pragma("foreign_key_check").length) process.exitCode=1; console.log(result); db.close();'
```

Tester périodiquement une restauration complète dans **un autre répertoire/volume
isolé**, avec `DELIVERY_PROVIDER=mock`, clés de test, intégrations externes
désactivées et sans trafic public. Restaurer DB et uploads, attribuer les droits
1001, lancer la version logicielle correspondante puis vérifier santé, connexion,
comptages et médias. Employer le `AUTH_SECRET` émetteur dans un environnement privé
si l’on doit tester les anciens tokens ; une clé éphémère ne permet pas leur replay.

Pour restaurer réellement : arrêter le storefront et le CRM (y compris workers),
conserver une copie de l’état en panne, remplacer la DB et les médias par la
sauvegarde validée et retirer les anciens fichiers `crm.db-wal`/`crm.db-shm` de la
destination arrêtée. Ne jamais garder des sidecars d’une autre DB. Rétablir les
droits et secrets, redémarrer une seule instance puis réconcilier les opérations
courier effectuées après la sauvegarde avant reprise du trafic. Restaurer SQLite
ne restaure pas le portail transporteur : aucun retry aveugle d’opération incertaine.

## Activation Ozon par le propriétaire

Conserver mock jusqu’à réception des identifiants du compte **de cette boutique**,
validation du contrat provider, des villes, du payload, du suivi et des BL.
Préparer une base live propre : ne pas envoyer les commandes de test mock à Ozon.
Dans Compose, définir explicitement `DELIVERY_PROVIDER=ozon` pour sortir du défaut
mock ; au runtime toute valeur autre que `mock` sélectionne l’adapter Ozon.

Vérification live existante, **lecture seule et accord explicite du propriétaire** :

```sh
node scripts/ozon-verify.mjs --yes
# Facultatif après autorisation pour un code réel : ajouter --code CODE_AUTORISE
```

Ce script est une action réseau réelle, même avec `DELIVERY_PROVIDER=mock` : il
appelle directement Ozon, charge `.env.local` si présent (parseur simple), et
requiert `OZON_CLIENT_ID`/`OZON_API_KEY`. Préférer des variables exportées privées
dans le dépôt cible. Il observe villes, tracking sur code factice et éventuellement
tracking/parcel-info réel ; il ne crée aucun colis, n’applique pas de mapping et
ne certifie pas le workflow d’expédition. Sa sortie brute peut contenir des données
client/provider : la relire et la caviarder avant tout partage. Ne pas exposer les
URLs `/customers/<id>/<key>/...` dans logs, tickets ou captures.

Les mappings inconnus/non vérifiés restent tels quels ; ils ne doivent jamais
déplacer le stock automatiquement. Le worker seul crée les colis ; le poller seul
lit le suivi opérationnel. BL/handoff exigent une action explicite, une claim
durable, et une réconciliation portail enregistrée en cas d’issue incertaine.
Ne pas relancer un BL incertain ou reprendre automatiquement une lease expirée.

## Rotation et mises à niveau

Conserver les secrets de façon durable et privée. Une rotation de `AUTH_SECRET`
invalide sessions et tokens dérivés : anciens replays checkout →
`TOKEN_SECRET_CHANGED`, anciens tokens upsell invalides. Les reçus ne disparaissent
pas et empêchent de recréer une commande avec la même clé, mais ils ne rendent
pas la rotation transparente. Il n’y a pas de keyring multi-secrets. Mettre le
checkout en maintenance, traiter les tentatives incertaines, fermer les parcours
ouverts et prévoir le traitement marchand des replays historiques avant rotation.
La simple attente de 20 secondes ne résout pas les replays historiques.
Coordonner la rotation de clé storefront avec son serveur ; aucune double clé
automatique. Voir [intégration](storefront-integration.md) pour le cookie exemple
et [mises à niveau](template-upgrades.md) pour migrations/rollback.

## Cloudflare

Le storefront et le CRM partagent le même domaine. Cloudflare sert de cache de bord
pour les pages publiques et de proxy pour tout le reste. À configurer par le
propriétaire (action manuelle, non faite par le code).

- **DNS** : enregistrement proxifié (nuage orange). **SSL/TLS : Full (strict)**, avec
  le certificat Let’s Encrypt que Coolify installe sur l’origine.
- **Cache Rules**, dans cet ordre :
  1. **Bypass cache** : chemin commençant par `/crm`, `/admin`, `/login`, `/api/`
     (sauf `/api/media/` et `/api/store/cross-sells`, voir règles 2 et 4) ou
     `/merci` ; **ou** cookie contenant `authjs.session-token`.
  2. **Eligible for cache, respect origin** : `/_next/static/*`, `/_next/image*`,
     `/api/media/*`, `/brand/*`, `/images/*` (l’origine envoie déjà un
     `Cache-Control` long, immutable pour `/brand` et `/images`).
  3. **Eligible for cache, Edge TTL 60 s, Browser TTL « respect origin »** : HTML de
     `/`, `/boutique*`, `/produit/*`, `/l/*`, `/a-propos`, `/contact`,
     `/livraison-retours`, `/cgv`, `/confidentialite`. Compromis : après une
     modification dans l’admin, le bord peut retarder d’au plus 60 s ; c’est
     acceptable car la confirmation reste la barrière de stock. Après un gros
     changement de catalogue, purger depuis le tableau de bord Cloudflare.
  4. `/api/store/cross-sells` : respect origin (`s-maxage=60`).
- Activer **Brotli** et **HTTP/3**. **Ne pas** activer Rocket Loader (il casse le
  chargement différé des pixels). Auto Minify est inutile.
- **IP client** : `SECURITY_TRUSTED_IP_HEADER` n’accepte que `x-real-ip` ou
  `x-forwarded-for` (toute autre valeur, dont `CF-Connecting-IP`, est ignorée sans
  erreur : aucune IP de confiance). Pour `x-forwarded-for`, le code lit le **dernier**
  saut. Derrière Cloudflare puis Traefik/Coolify, ce dernier saut peut être une IP de
  bord Cloudflare ou du proxy, pas le visiteur. Recommandation sûre : **laisser vide**,
  sauf si votre chaîne de proxys (accès direct à l’origine fermé, pare-feu limité aux
  plages Cloudflare) écrase `x-real-ip` ou garantit un dernier saut `x-forwarded-for`
  égal à l’IP du visiteur. Limite connue : tant que ce n’est pas le cas, les limites
  de débit par IP et l’IP envoyée à la CAPI Meta/TikTok voient l’IP du proxy/bord, ou
  aucune IP si la variable est vide ; les budgets globaux/compte/téléphone restent
  actifs.
- `CRM_PUBLIC_URL` et `SECURITY_ALLOWED_ORIGINS` doivent utiliser le domaine public
  en `https://`.

### Coolify

Ressource **Dockerfile** depuis le dépôt GitHub de la niche, port 3000, **une seule
réplique** (SQLite) avec arrêt de l’ancien conteneur avant remplacement. Volume
persistant monté sur `/app/data` : il contient `crm.db`, `uploads`, `backups` **et le
cache d’images** `/app/data/image-cache` (lien depuis `/app/.next/cache/images`).
Variables : coller `.env.production.example` (voir [new-niche](new-niche.md)). Health
check : `/api/health`. **`PORT` doit correspondre au port réellement écouté** (3000
dans l’image) : le préchauffage au démarrage appelle `http://127.0.0.1:${PORT ?? 3000}`.
Un `PORT` différent du port d’écoute laisse `/` et `/boutique` vides jusqu’à la
revalidation de 300 s.

## Cache & performance

- **Fraîcheur** : les pages `/`, `/boutique`, `/boutique/[categorie]`,
  `/produit/[slug]` et `/l/[slug]` sont servies par l’ISR de Next (`revalidate = 300`)
  et le cache de données `unstable_cache` étiqueté `storefront`. `revalidateStorefront()`
  (tag + `revalidatePath("/", "layout")`) est appelé après chaque mutation visible :
  produits/packs/archivage/restauration, paramètres, stock (ouverture, ajustement,
  lot), confirmation/annulation/édition/lignes de commande, inspection des
  retours et agent catalogue. Les 300 s rattrapent un oubli.
- **Build sans base** : `generateStaticParams` renvoie `[]` et les loaders
  storefront renvoient des données vides pendant `phase-production-build`. Le build
  n’ouvre jamais SQLite. Au démarrage, un préchauffage (`/api/internal/warmup`,
  jeton dérivé d’`AUTH_SECRET`) invalide les pages vides puis rend `/` et
  `/boutique` ; voir la note `PORT` ci-dessus. Les autres pages se remplissent à la
  première visite.
- **Cache d’images** `/app/data/image-cache` : sans risque à supprimer, il se
  reconstruit à la demande.
- **Contrôle** (HIT/STALE attendus après la première visite, jamais MISS à chaque
  requête) :

  ```sh
  for p in / /boutique /produit/<slug> /l/<slug>; do
    curl -sI "https://votre-domaine$p" | grep -i '^x-nextjs-cache'
  done
  # Côté Cloudflare : curl -sI ... | grep -i '^cf-cache-status'
  ```

- **Interdit dans `src/app/(storefront)`**, car cela rend la route dynamique :
  `cookies()`, `headers()`, `searchParams`, `auth()`, `connection()`,
  `export const dynamic = "force-dynamic"`.
- **Budget JS** : ≤ 120 KiB (122 880 octets) gzip au premier chargement sur `/produit/[slug]` et
  `/l/[slug]`. Après un build :

  ```sh
  DELIVERY_PROVIDER=mock npm run build && npm run perf-budget
  ```

  `scripts/perf-budget.mjs` ne lit que `.next` (jamais la DB). Pour chaque route il
  prend `pages[route]` de `.next/app-build-manifest.json` plus l’entrée du layout racine
  storefront `/(storefront)/layout`, fichiers `.js` uniquement, dédupliqués, gzip niveau 9,
  puis somme. Le budget par défaut est 120 KiB (122 880 octets), modifiable avec
  `PERF_BUDGET_KB`. Il échoue (code 1) si un budget est dépassé, si `.next` ou une
  route manque, si une route storefront n’est plus statique/ISR, ou si un chunk
  de ces routes contient `libphonenumber`, `ZodError`, `better-sqlite3` ou
  `node:crypto`. Il affiche aussi `/`, `/boutique`, `/merci` et une page de
  contenu pour information. La marge est faible (build de revue : `/produit/[slug]` ≈ 115,5 KiB, `/l/[slug]`
  ≈ 117,5 KiB sur 120 KiB, soit ≈ 118,3 et ≈ 120,3 kB décimaux ; relancer
  `npm run perf-budget` pour les valeurs exactes). Tout ajout de code client
  storefront impose de relancer le budget après build. Si le budget approche : si le budget approche, alléger
  l’îlot du layout storefront ou charger paresseusement l’UI rarement utilisée.
- **Toaster** : `sonner` n’est monté que dans le layout `(admin)` et dans un toaster
  de superposition chargé paresseusement par l’hôte du tunnel. Un nouveau code
  storefront ne doit pas importer `sonner` ni `components/ui/sonner` dans le bundle
  initial.
- **Packs** : une remise de pack est stockée comme remise fixe de commande, avec
  `pack_snapshot_json` pour le détail. Si un agent modifie la commande, la remise
  fixe est conservée jusqu’à ce que l’agent la change ; il n’y a aucun recalcul
  automatique.

## Limites connues

- `/merci` affiche les totaux de ligne sans remise avec le total serveur pour les
  commandes en pack : pas encore de ligne de remise ni de livraison.
- Sans IP client fiable (voir « IP client »), les limites par IP et la CAPI voient
  l’IP du proxy/bord Cloudflare.
