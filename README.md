# Billetterie de bus urbains

Monorepo développé selon les phases du [cahier des charges](./cahier-des-charges-billetterie-bus.md). Les phases 1 à 5 sont implémentées côté code; l’impression Bluetooth reste à valider sur une imprimante réelle.

## État de la phase 1

- API Express et modèle Prisma multi-transporteurs : implémentés.
- Calcul pur des tronçons, partagé via `shared/` : implémenté.
- Tests unitaires du tarif : disponibles.
- Tests d'intégration PostgreSQL : disponibles, à exécuter avec une base dédiée.
- Interface présente dans `front/` : projet Next.js existant, non modifié pendant la phase 1. La migration vers React/Vite n'est pas incluse ici.
- Phase 2 — administration Next.js : tableau de bord, ressources du transporteur, ventes, annulations, audit et espace plateforme implémentés.
- Phase 5 — rapports détaillés, exports CSV/Excel, journal d'audit complété et guides de déploiement/utilisation documentés.

La suite d'intégration backend a besoin de PostgreSQL et n'a pas été exécutée dans l'environnement courant (`DATABASE_URL` absent). Les tests unitaires frontend sont dans `front/test/`.

## Démarrage du backend

1. Installer PostgreSQL et créer une base locale dédiée.
2. Copier `backend/.env.example` vers `backend/.env`, puis définir `DATABASE_URL` et générer un `JWT_ACCESS_SECRET` aléatoire de 32 caractères ou plus.
3. Dans `backend/`, exécuter `npm install`, `npm run db:generate` et `npm run db:migrate`.
4. Lancer l'API avec `npm start`. Le point de santé est `GET http://localhost:3001/api/health`.
5. Pour charger les deux transporteurs de démonstration, définir `DEMO_PASSWORD` (12 caractères minimum), puis exécuter `npm run db:seed`.

Les connexions de démonstration utilisent les identifiants `transporteur1`, `receveur1`, `transporteur2` et `receveur2`, avec le mot de passe choisi dans `DEMO_PASSWORD`.
Pour créer le premier administrateur plateforme pendant le seed, définir aussi `PLATFORM_ADMIN_LOGIN` et `PLATFORM_ADMIN_PASSWORD` (12 caractères minimum).

## Vérification

Dans `backend/`, `npm test` exécute les tests unitaires et d'intégration. Les tests d'intégration sont ignorés explicitement si `DATABASE_URL` est absente ; ils nécessitent une base migrée dédiée pour ne pas toucher à des données existantes.

La documentation de l'API est dans [docs/api.md](./docs/api.md). Les guides d'utilisation du receveur et du transporteur sont dans [docs/guide-receveur.md](./docs/guide-receveur.md) et [docs/guide-transporteur.md](./docs/guide-transporteur.md). L'installation, le déploiement et les sauvegardes sont décrits dans [docs/deploiement-et-sauvegardes.md](./docs/deploiement-et-sauvegardes.md). Voir aussi [docs/phase-1-backend.md](./docs/phase-1-backend.md), [docs/phase-2-admin-web.md](./docs/phase-2-admin-web.md), [docs/phase-3-receiver.md](./docs/phase-3-receiver.md) et [docs/phase-4-bluetooth-printing.md](./docs/phase-4-bluetooth-printing.md).
