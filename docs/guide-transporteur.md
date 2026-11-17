# Guide d'utilisation — transporteur

L'administration web est accessible à l'URL de l'application, généralement `/`. Utiliser un compte transporteur et son identifiant de tenant pour se connecter. Les menus dépendent du rôle, et les autorisations sont aussi vérifiées côté API.

## Mise en service

1. Créer les bus et leurs versements journaliers attendus.
2. Créer chaque ligne et ses repères dans l'ordre, puis valider le réseau.
3. Enregistrer le tarif applicable; un tarif prend effet à la date configurée.
4. Créer les comptes receveur avec un mot de passe initial robuste. Distribuer les identifiants par un canal privé.
5. Créer les appareils, définir un préfixe de ticket unique et affecter l'appareil au receveur concerné.
6. Ouvrir un service avec bus, ligne, receveur, appareil et sens. Le service conserve un instantané de la ligne et du tarif.
7. Fournir l'URL de l'application Android et les instructions de connexion aux receveurs.

Les gestionnaires peuvent gérer les bus et lignes ainsi que les comptes receveur; seuls les transporteurs configurent les tarifs, appareils et rapports. Les contrôleurs disposent d'un accès en lecture aux ventes et rapports.

## Suivi quotidien

- Sur le tableau de bord, choisir les dates de début et de fin puis actualiser.
- Comparer les recettes nettes, les versements attendus et les écarts par bus.
- Consulter les détails par jour, ligne, bus et receveur, ainsi que les annulations par receveur.
- Exporter les ventes de la période au format CSV ou Excel pour rapprochement. Les ventes annulées sont identifiées avec leur motif, et portent `Comptée dans les recettes = NON`.
- Dans Ventes, filtrer la période, le bus, la ligne, le receveur ou le statut d'annulation. Examiner le détail du ticket avant toute annulation.
- Une annulation exige un motif et reste dans l'historique; elle n'est jamais comptée dans les recettes nettes.
- Consulter le Journal d'audit pour vérifier qui a créé/modifié une ressource, terminé un service ou annulé une vente.

## Comptes et sécurité opérationnelle

Désactiver sans délai un compte ou appareil perdu/inutilisé. Réinitialiser les mots de passe via l'administration; ne pas les partager dans les exports. Utiliser un mot de passe différent par personne et HTTPS. Les données affichées par les rapports et exports restent limitées au transporteur connecté.

Pour les procédures d'installation et de sauvegarde, voir [deploiement-et-sauvegardes.md](./deploiement-et-sauvegardes.md); pour la description des routes, voir [api.md](./api.md).
