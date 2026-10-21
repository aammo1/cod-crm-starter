# COD CRM Starter

Vérification de l’assemblage et limites constatées :
[`docs/release-verification.md`](docs/release-verification.md).

CRM **sans storefront** pour boutiques marocaines en paiement à la livraison :
catalogue et variantes génériques, stock, commandes, équipe, confirmation,
expéditions/BL, suivi, retours et paramètres. Interface en français, prix MAD
entiers. Votre storefront conserve son design et appelle le CRM depuis son serveur.

## Une installation par boutique

Modèle public publié : [aammo1/cod-crm-starter](https://github.com/aammo1/cod-crm-starter).
L’option template est activée : choisir **Use this template →
Create a new repository**, puis cloner votre copie. Chaque copie possède son propre déploiement,
SQLite, médias, utilisateurs, stock et secrets ; elle ne reçoit aucune mise à jour
automatique du modèle. Voir [les mises à niveau](docs/template-upgrades.md).

## Démarrage local (Node.js 22+, npm)

```sh
npm install
cp .env.example .env.local
openssl rand -base64 32
# Mettre cette nouvelle valeur dans AUTH_SECRET dans .env.local.
# Garder DELIVERY_PROVIDER=mock ; origines locales par défaut : localhost:3000.
npm run dev
```

Ouvrir `http://localhost:3000` → `/login`, puis `/crm` après connexion.
SQLite `data/crm.db` et les médias `data/uploads` sont propres à cette copie.
Les migrations sont appliquées à l’ouverture de la base, jamais pendant le build.
Aucun utilisateur, produit ou commande de démonstration n’est créé au démarrage.
Les villes mock et les données techniques de fonctionnement peuvent être initialisées.

Créer explicitement le premier administrateur depuis la racine du dépôt :

```sh
node scripts/create-user.mjs admin@example.test '<mot-de-passe-unique-12-a-128-caracteres>' 'Administrateur' admin
# Facultatif : même commande avec le rôle agent ; gestion suivante via /crm/equipe.
```

Les scripts Node ne chargent pas `.env.local` : exporter `DB_PATH` si vous avez
choisi un autre chemin. La commande ci-dessus **met aussi à jour** un email existant
(mot de passe, rôle, activation, version de session). Aucun identifiant prédéfini.
Éviter de laisser le vrai mot de passe dans l’historique du terminal ; en shell
interactif on peut lire une variable avec `read -rs` et la passer entre guillemets
(les arguments restent visibles aux processus locaux autorisés).

## Docker / production

```sh
cp .env.example .env
# Renseigner AUTH_SECRET, CRM_PUBLIC_URL et SECURITY_ALLOWED_ORIGINS dans .env.
# Exemple local : http://localhost:3000 ; production : origine HTTPS exacte.
docker compose --env-file .env -p ma-boutique config --quiet
docker compose --env-file .env -p ma-boutique up -d --build
docker compose --env-file .env -p ma-boutique exec crm node scripts/create-user.mjs admin@example.test '<mot-de-passe-unique-12-a-128-caracteres>' 'Administrateur' admin
docker compose --env-file .env -p ma-boutique exec crm node scripts/backup-db.mjs
```

Service `crm`, port 3000 lié à `127.0.0.1`, volume nommé par projet
`ma-boutique_crm-data` monté sur `/app/data` (DB et uploads). Utiliser un nom de
projet unique par boutique, et adapter le port hôte pour plusieurs instances sur
la même machine. Processus nonroot UID/GID 1001 ; HTTPS via reverse proxy.
Le mode mock est le défaut de l’exemple et de l’image. Lire
[les opérations](docs/operations.md) pour permissions, santé, sauvegarde/restauration,
Coolify et activation Ozon explicite. Ne pas partager ce volume entre boutiques
ou lancer plusieurs instances/rolling deployments sur le même SQLite.

## Connecter votre storefront

Configurer `STOREFRONT_API_KEY` (nouvelle clé `openssl rand -hex 32`) et
`CRM_PUBLIC_URL` côté CRM. Côté **serveur storefront** : `CRM_BASE_URL` et
`CRM_STOREFRONT_KEY`. Aucune de ces clés dans le navigateur ou `NEXT_PUBLIC_*`.

- [Guide définitif API, client et prompt agent](docs/storefront-integration.md)
- [Client TypeScript copiable](integrations/storefront-client.ts)
- [Exemple Next.js sécurisé et vérification](examples/nextjs/README.md)
- [Instructions pour travailler dans ce dépôt](AGENTS.md)

Le checkout demande seulement nom et téléphone marocain, plus les variantes et
quantités du panier ; le CRM calcule les prix et les frais. Adresse et ville sont
collectées par l’agent avant confirmation. Les réglages par défaut sont 29 MAD de
livraison, livraison gratuite dès 400 MAD et upsell facultatif de 20 s à −30 %.
Le catalogue peut être vide. Assistant, catalogue automatisé et Meta sont
facultatifs et ne nécessitent aucune clé payante pour démarrer.

## Vérifications

```sh
npm run lint
npx tsc --noEmit
DELIVERY_PROVIDER=mock npm run build
DELIVERY_PROVIDER=mock npm run start
node --test examples/nextjs/verify.test.mjs
npm run test:bootstrap
npm run test:crm
npm run test:catalog-agent
npm run test:security
npm run test:meta
npm run test:assistant
```

`npm run start` sert à la vérification locale ; Docker lance
`node server.js` depuis la sortie standalone avec `public`, `.next/static`,
les migrations et les outils d’administration inclus. Ne jamais utiliser de base
réelle pour les tests : DB/médias temporaires, mock et secrets éphémères uniquement.
