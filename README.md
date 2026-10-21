# COD CRM Starter

Base CRM indépendante pour les boutiques marocaines en paiement à la livraison.
Extraction initiale : le modèle générique et l'API storefront v1 sont décrits
dans `specs/cod-crm-starter/` et seront implémentés dans les tâches suivantes.

## Démarrage local

```sh
npm install
cp .env.example .env.local
# Renseigner AUTH_SECRET avec une valeur aléatoire (openssl rand -base64 32).
# DELIVERY_PROVIDER=mock empêche les appels réels au transporteur.
npm run dev
```

La base `data/crm.db` est créée à la première utilisation, sans utilisateurs,
produits ni commandes. `/` dirige vers `/login` ou `/crm` selon la session.
Créer explicitement le premier administrateur (les scripts Node ne chargent pas
automatiquement `.env.local`; exporter DB_PATH si un autre chemin est choisi) :

```sh
node scripts/create-user.mjs admin@example.test '<mot-de-passe>' 'Administrateur' admin
```

## Vérification et persistance

```sh
npm run lint
npx tsc --noEmit
DELIVERY_PROVIDER=mock npm run build
DELIVERY_PROVIDER=mock npm run start
npm run backup
```

Docker utilise la sortie standalone et le volume `/app/data` pour SQLite et
les médias. Définir `AUTH_SECRET` et `SECURITY_ALLOWED_ORIGINS` (origine exacte
du CRM) avant `docker compose up --build`. Chaque installation doit avoir son
propre volume et ses propres identifiants. Les services assistant, catalogue
automatisé et Meta sont optionnels et désactivés sans configuration.

Le dépôt est une extraction locale non publiée. Inventaire et dépendances
transitoires : `docs/extraction-manifest.md`. Instructions agents : `AGENTS.md`.
