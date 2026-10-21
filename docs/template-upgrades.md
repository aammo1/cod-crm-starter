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
