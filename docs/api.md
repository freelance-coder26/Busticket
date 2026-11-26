# Référence API

L'API Express est exposée sous `/api`. Elle utilise PostgreSQL via Prisma. En production, la servir uniquement derrière HTTPS. Sauf mention contraire, les routes métier demandent `Authorization: Bearer <accessToken>`.

## Authentification et règles communes

| Méthode | Route | Accès | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Vérification de disponibilité de l'API. |
| `POST` | `/auth/login` | Public, limité à 10 tentatives par fenêtre de 15 minutes et par IP | Corps : `login`, `motDePasse`. `login` est unique sur toute la plateforme, aucun identifiant de transporteur n'est nécessaire. |
| `POST` | `/auth/refresh` | Public | Aucun corps : le jeton de renouvellement voyage dans un cookie `HttpOnly` posé à la connexion et fait tourner le jeton à usage unique. |
| `POST` | `/auth/logout` | Authentifié | Aucun corps : révoque le jeton de renouvellement lu dans le même cookie et le vide. |
| `GET` | `/auth/me` | Authentifié | Renvoie l'identité, le rôle et le transporteur du jeton. |

Les corps JSON sont validés côté serveur et les objets d'entrée rejettent les champs inattendus. Les identifiants sont des UUID. Les erreurs utilisent un statut HTTP et un objet `{ "erreur": "...", "code": "..." }`. Un jeton d'accès expire après 15 minutes par défaut (renvoyé dans la réponse JSON, à garder en mémoire côté client) ; le jeton de renouvellement est rotatif, expire après 30 jours par défaut et n'est jamais exposé en JavaScript.

## Ressources

| Méthode | Route | Rôles |
|---|---|---|
| `GET`, `POST`, `PATCH` | `/transporteurs`, `/transporteurs/:id` | Administrateur plateforme |
| `GET`, `POST`, `PATCH`, `DELETE` | `/bus`, `/bus/:id` | Transporteur, gestionnaire |
| `GET`, `POST`, `PATCH`, `DELETE` | `/lignes`, `/lignes/:id` | Transporteur, gestionnaire |
| `GET`, `POST` | `/tarifs` | Transporteur |
| `GET`, `POST`, `PATCH` | `/utilisateurs`, `/utilisateurs/:id` | Transporteur; gestionnaire limité aux comptes receveur |
| `GET`, `POST`, `PATCH` | `/appareils`, `/appareils/:id` | Transporteur |
| `GET`, `POST`, `PATCH` | `/services`, `/services/:id` | Transporteur, gestionnaire; receveur pour ses services |
| `GET` | `/config-service?serviceId=<uuid>` | Utilisateur autorisé du transporteur |

Les champs principaux sont `code`, `nom`, `versementAttenduGnf` pour un bus; `nom` et `reperes` ordonnés (`nom`, `position`) pour une ligne; `montantGnf`, `dateEffet` pour un tarif; et `busId`, `ligneId`, `receveurId`, `sens` (`ALLER` ou `RETOUR`) pour ouvrir un service. Les suppressions de bus ou lignes référencés sont refusées. Les services se terminent avec `PATCH /services/:id` et le corps `{ "statut": "TERMINE" }`.

Les ressources sont toujours filtrées par le `transporteurId` du jeton. Un identifiant de transporteur fourni par un client ne peut pas changer le tenant courant. Les receveurs ne consultent que leurs services et leurs ventes.

## Ventes, rapports et exports

| Méthode | Route | Rôles |
|---|---|---|
| `POST` | `/sync/ventes` | Receveur authentifié |
| `GET` | `/ventes?page=1&limit=25&du=AAAA-MM-JJ&au=AAAA-MM-JJ` | Transporteur, gestionnaire, contrôleur, receveur (ses ventes) |
| `GET` | `/ventes/:id` | Même contrôle tenant et receveur |
| `POST` | `/ventes/:id/annulation` | Transporteur; motif obligatoire |
| `GET` | `/ventes/export?du=AAAA-MM-JJ&au=AAAA-MM-JJ&format=csv` | Rôles autorisés à lire les ventes |
| `GET` | `/rapports?du=AAAA-MM-JJ&au=AAAA-MM-JJ` | Transporteur, contrôleur |

`du` et `au` sont inclus dans la période, au format strict `AAAA-MM-JJ`; l'export les exige tous les deux. L'export accepte `format=csv` ou `format=excel` (fichier Excel XML `.xls`). Il peut aussi recevoir les filtres `busId`, `ligneId` et `receveurId`; le rôle receveur reste limité à son propre identifiant.

L'export détaille chaque ticket, son montant, son statut (`VALIDEE` ou `ANNULEE`), le motif et la date d'annulation, ainsi qu'un champ `Comptée dans les recettes`. Une vente annulée reste visible mais porte `NON`. Les rapports et indicateurs du tableau de bord calculent les recettes uniquement à partir des ventes non annulées. Les cellules textuelles d'export sont échappées; les valeurs CSV susceptibles d'être interprétées comme une formule sont neutralisées.

Le rapport renvoie le total de tickets et recettes nettes, les annulations, les écarts de versement, les agrégats `parJour`, `parBus`, `parLigne`, `parReceveur`, `ecartsParBus` et `annulationsParReceveur`. Les libellés historiques sont tirés des instantanés sauvegardés avec chaque vente.

La synchronisation accepte `{ "ventes": [...] }` (au plus 100 éléments) et répond individuellement `ACCEPTEE`, `DEJA_RECUE` ou `REFUSEE`. Le serveur recalcule et valide le tarif et le montant; les identifiants clients rendent les renvois idempotents.

## Audit

`GET /journal-audit?page=1&limit=50` est réservé au transporteur et renvoie ses événements les plus récents, paginés (limite maximale : 100). Le journal couvre les créations/modifications/suppressions métier prises en charge, les fins de service, les annulations et les changements de transporteur. Les modifications sont consignées dans la même transaction que l'opération métier; aucun mot de passe n'est enregistré dans les instantanés.
