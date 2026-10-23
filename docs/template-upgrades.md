# Mettre à niveau une copie du template

Une copie créée avec **Use this template** est indépendante : dépôt, historique,
déploiement, SQLite, médias et secrets. Modifier le template ne modifie pas vos
boutiques. Il n’y a ni mise à jour automatique, ni schéma partagé, ni remplacement
global des fichiers d’une copie. La destination publique du template est
`https://github.com/aammo1/cod-crm-starter` ; vérifier sa publication et choisir une
révision/tag précis avant de planifier une mise à niveau.

## Procédure délibérée

1. Enregistrer la révision upstream utilisée lors de la création et les adaptations
   locales (métier, provider, UI, intégrations). Conserver un inventaire par boutique.
2. Lire les changements entre cette révision et la cible : dépendances/lockfile,
   env, sécurité, contrat v1, client et exemples, migrations, workers et Docker.
   Ajouter éventuellement upstream comme remote de lecture dans votre copie ;
   cela ne fusionne ni ne déploie rien.
3. Créer une branche de mise à niveau, transférer les correctifs sélectionnés par
   cherry-pick si l’historique le permet, sinon appliquer un patch relu. Les copies
   GitHub template peuvent ne pas partager l’ascendance nécessaire au merge.
   Résoudre explicitement les conflits et relire chaque modification ; ne pas
   écraser `.env*`, données ou adaptations locales avec les fichiers upstream.
4. Sauvegarder et vérifier la restauration DB/uploads/secrets avant tout démarrage
   du nouveau code : l’ouverture DB applique immédiatement les migrations absentes.
   Ne jamais réécrire une migration déjà appliquée ; ajouter une migration nouvelle,
   sans seed, en vérifiant son ordre et son nom dans `_migrations` de chaque copie.
5. Tester sur une restauration **isolée**, mock, sans credentials externes ni trafic
   client. Vérifier nouvelle base vide **et** ancienne base migrée, IDs/SKUs et
   historiques, stock/réservations, reçus/retries, confirmation, BL/réconciliation,
   retours, permissions, médias et connexion storefront. Ne pas supprimer de reçus
   durables pour « réparer » un retry.
6. Exécuter les checks ci-dessous. Revoir la compatibilité des consommateurs v1 ;
   reporter volontairement le client et les exemples dans chaque dépôt storefront,
   sans exposer leurs secrets. Aucun client externe ne se met à jour tout seul.
7. Préparer une fenêtre de maintenance, arrêter le trafic de création et l’ancien
   owner DB/workers, prendre la sauvegarde finale, déployer **une** instance, puis
   vérifier santé/heartbeats/files/médias et le parcours avant reprise du trafic.
   Garder les secrets stables pendant la mise à niveau sauf rotation planifiée.

```sh
npm run lint
npx tsc --noEmit
DELIVERY_PROVIDER=mock npm run build
npm run test:bootstrap
npm run test:crm
npm run test:catalog-agent
npm run test:security
npm run test:meta
npm run test:assistant
node --test examples/nextjs/verify.test.mjs
```

Ces commandes de régression utilisent leurs fixtures isolées ; toute vérification
manuelle doit aussi utiliser DB/médias temporaires et secrets éphémères. Faire un
smoke Docker avec un projet/volume neuf lorsque le daemon est accessible.

## Retour arrière

Un rollback d’image ne défait pas une migration et peut ne plus savoir lire le
nouveau schéma. Préparer avant déploiement la paire version logicielle + snapshot
DB/médias vérifié. Si une restauration est nécessaire, arrêter toutes les écritures,
préserver l’état récent et suivre [les opérations](operations.md). Réconcilier les
commandes et appels transporteur postérieurs au snapshot avant toute reprise.
Ne jamais automatiser un downgrade SQL ou une recréation de colis après rollback.
Enregistrer la révision cible, les migrations appliquées, les vérifications et la
date pour que la prochaine mise à niveau parte de l’état réel de cette boutique.

## Points à revérifier à chaque mise à niveau de Next.js

Next est épinglé à **15.5.28**. Le storefront évite volontairement `next/image` côté
client et s’appuie sur des détails internes de Next ; ne pas changer la version sans
cette checklist.

- `src/components/storefront/ui/store-image.tsx` importe `getImgProps` et
  `image-loader` depuis `next/dist/shared/lib/*` (imports profonds) et lit
  `process.env.__NEXT_IMAGE_OPTS`, remplacé au build par le plugin define de Next.
  `src/components/storefront/product/gallery.tsx` construit lui-même les URLs
  `/_next/image?url=…&w=…&q=75`.
- Le dictionnaire de langue actif vient de `NEXT_PUBLIC_STORE_LOCALE`, défini dans
  `next.config.ts` (`env`) à partir de `store.config.ts` : un seul dictionnaire `fr`
  ou `ar` part dans le bundle.

Checklist :

1. Les deux chemins `next/dist/shared/lib/get-img-props` et `image-loader` existent
   toujours, avec la même signature ; `__NEXT_IMAGE_OPTS` est encore défini.
2. Les URLs `/_next/image` générées (widths, `q`) restent acceptées par l’optimiseur
   (`images.deviceSizes`/`imageSizes` de `next.config.ts`, `src/config/image-sizes`).
3. `NEXT_PUBLIC_STORE_LOCALE` est toujours inlinée : le bundle d’une boutique `fr`
   ne contient pas le dictionnaire `ar`, et inversement.
4. `DELIVERY_PROVIDER=mock npm run build` n’ouvre pas la DB, puis `npm run perf-budget`
   passe (routes `/`, `/produit/[slug]`, `/l/[slug]` toujours statiques/ISR, budget JS
   respecté ; la marge est faible).
5. `experimental.globalNotFound: true` est toujours présent dans `next.config.ts` : il est
   indispensable car il n’y a pas de layout racine de premier niveau
   (`src/app/global-not-found.tsx`). Structure multi-layouts racine : `(storefront)` et
   `(admin)` rendent chacun leur propre `<html>` ; les routes hors de ces deux groupes
   (robots, sitemap, api) n’ont besoin d’aucun layout.
6. Après `npm run start` et une première visite, `x-nextjs-cache` vaut `HIT` ou `STALE`
   sur `/`, `/boutique`, `/produit/<slug>` et `/l/<slug>` (voir
   [Cache & performance](operations.md#cache--performance)).
