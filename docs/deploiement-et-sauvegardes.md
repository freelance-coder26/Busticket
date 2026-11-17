# Installation, déploiement et sauvegardes

## Prérequis

- Node.js compatible avec les dépendances du dépôt, npm et PostgreSQL.
- Un nom DNS et un certificat TLS pour l'API de production.
- Pour compiler l'application receveur Android : JDK 17, Android Studio/SDK et Capacitor; voir [phase-3-receiver.md](./phase-3-receiver.md).

## Installation locale

Depuis `backend/` sous PowerShell :

```powershell
Copy-Item .env.example .env
# Renseigner DATABASE_URL, JWT_ACCESS_SECRET (32 caractères aléatoires minimum) et WEB_ORIGIN.
npm ci
npm run db:generate
npm run db:validate
npm run db:migrate
npm test
npm start
```

Depuis `front/` :

```powershell
npm ci
$env:NEXT_PUBLIC_API_URL = "http://localhost:3001/api"
npm run build
```

Le frontend est exporté statiquement dans `front/out/`. Servir ce répertoire depuis un hébergement web statique et configurer `WEB_ORIGIN` avec son origine exacte. L'API est un processus Node séparé; mettre un proxy inverse HTTPS devant elle et ne pas exposer PostgreSQL sur Internet.

## Déploiement

1. Préparer PostgreSQL et fournir les secrets via le gestionnaire de secrets de la plateforme (pas dans Git, une image ou les journaux).
2. Installer les dépendances verrouillées avec `npm ci`, générer Prisma (`npm run db:generate`) et appliquer uniquement les migrations versionnées avec `npm run db:deploy`.
3. Déployer l'API derrière HTTPS et définir `DATABASE_URL`, `JWT_ACCESS_SECRET` aléatoire, `WEB_ORIGIN` et les paramètres métier nécessaires.
4. Construire le frontend avec `NEXT_PUBLIC_API_URL` pointant sur l'API HTTPS publique, puis publier `front/out/`.
5. Pour Android, reconstruire l'APK après avoir défini l'URL API de production; ne pas utiliser `localhost` sur un appareil physique.
6. Vérifier `/api/health`, la connexion, la lecture de ressources, un rapport et une exportation avant ouverture aux utilisateurs.

Ne pas utiliser `db:migrate` en production; cette commande est destinée au développement. Vérifier les migrations et prévoir une fenêtre de maintenance avant `db:deploy`.

## Sauvegarde PostgreSQL

Planifier une sauvegarde cohérente et chiffrée, stockée hors du serveur de base, avec des droits d'accès restreints. Une sauvegarde de volume/serveur n'est pas un substitut à `pg_dump`.

Exemple PowerShell de sauvegarde personnalisée :

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
pg_dump --format=custom --no-owner --file "busticket-$stamp.dump" --dbname "$env:DATABASE_URL"
```

Protéger et transférer le fichier vers un stockage chiffré distinct, puis contrôler le code de sortie et la taille avant de considérer la tâche réussie. Ne pas inclure `.env` dans l'archive.

## Test de restauration

Utiliser un secret injecté localement pour `$env:RESTORE_DATABASE_URL` plutôt qu'un mot de passe réel dans l'historique du terminal. Restaurer régulièrement dans une base de test dédiée, jamais dans la base de production :

```powershell
$env:RESTORE_DATABASE_URL = "postgresql://user:password@localhost:5432/busticket_restore"
createdb busticket_restore
pg_restore --no-owner --dbname "$env:RESTORE_DATABASE_URL" ".\busticket-YYYYMMDD-HHMMSS.dump"
```

Vérifier l'application des migrations et quelques données métier (transporteur, vente, annulation et journal d'audit), puis supprimer la base de test selon la procédure de l'équipe. Documenter la date, le résultat, la durée de restauration et les éventuels écarts. Définir une fréquence et une durée de rétention adaptées aux obligations de l'exploitation.

## Contrôles de sécurité avant mise en production

- HTTPS obligatoire; secrets injectés à l'exécution et rotation de `JWT_ACCESS_SECRET` organisée.
- `WEB_ORIGIN` restreint aux origines de confiance; `DATABASE_URL` accessible uniquement depuis le backend.
- Limitation des connexions : 10 tentatives par fenêtre de 15 minutes et par IP. Compléter par les protections du proxy/pare-feu en production.
- Vérifier les rôles, l'isolation tenant et les validations serveur avec les tests; ne pas considérer le filtrage de menus frontend comme une permission.
- Un audit ciblé des contrôles d'isolation, permissions, limitation de connexion et validation des entrées n'a relevé aucune vulnérabilité exploitable dans le périmètre revu. Les tests d'intégration PostgreSQL restent requis avant déploiement.
