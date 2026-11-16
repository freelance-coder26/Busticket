# CAHIER DES CHARGES
## Plateforme de billetterie électronique pour bus urbains (Conakry, Guinée)

*Version 1.0, 23 octobre 2026.*

---

## 1. Présentation

**1.1 Objet.** Digitaliser la vente des tickets à bord des bus urbains. Le receveur enregistre la vente, encaisse en espèces et imprime un ticket papier par imprimante thermique Bluetooth. Le transporteur suit ses recettes.

**1.2 Ce que ce n'est pas.** Une application de réservation. Le passager monte directement dans le bus.

**1.3 Objectifs.**
- Vendre et imprimer sans connexion Internet.
- Calculer les tarifs de façon transparente, sans ajustement possible.
- Empêcher les doubles encaissements et les modifications discrètes.
- Donner à chaque transporteur une vue fiable de ses bus et de ses recettes.

**1.4 Modèle d'exploitation.** Gorohitech fournit la plateforme à plusieurs transporteurs. Un transporteur est l'organisation propriétaire des bus (société, coopérative ou propriétaire individuel) et ne voit que ses propres données.

---

## 2. Acteurs et rôles

| Rôle | Description | Droits principaux |
|---|---|---|
| **Administrateur plateforme** (Gorohitech) | Gère la plateforme | Créer, activer et désactiver les transporteurs et leur compte principal ; vue globale |
| **Transporteur** | Propriétaire des bus | Accès complet à son espace : bus, lignes, tarif, utilisateurs, appareils, services, ventes, annulations, rapports, audit |
| **Gestionnaire** (optionnel) | Employé du transporteur | Bus, lignes, repères, receveurs, services, consultation des ventes. Pas de tarif, pas de comptes gestionnaire, pas d'annulation *(hypothèse à valider)* |
| **Receveur** | Vend à bord | Vend, imprime, consulte son propre historique, déclare sa fin de service. Pas d'accès à l'admin web |
| **Contrôleur** | Audit | Lecture seule des ventes et rapports autorisés |

Les permissions sont définies à un seul endroit du code pour être faciles à modifier. La sécurité réelle est toujours appliquée côté serveur.

---

## 3. Périmètre

**Inclus (phases 1 à 5).** Backend multi-transporteurs, administration web, application receveur Android avec vente hors ligne, impression Bluetooth, synchronisation, tableaux de bord et rapports.

**Exclus pour l'instant.** GPS, carte, ajustement manuel des tronçons, remboursements, Mobile Money, iPhone, distance en kilomètres.

**Évolutions possibles.** GPS, Mobile Money, QR code de contrôle sur le ticket, plusieurs langues.

---

## 4. Règles métier

### 4.1 Tarification
- Tarif par défaut : **2 000 GNF par tronçon**, modifiable par le transporteur avec une date d'effet.
- Chaque ligne a une liste ordonnée de **repères**. Chaque repère a une **position cumulée en tronçons** (entier). Exemple : Km 36 = 0, Lanssanaya = 1, Kissosso = 3.
- Le tableau est identique à l'aller et au retour.
- **Montée** = dernier repère déjà dépassé. **Descente** = prochain repère atteint. Tout tronçon commencé est dû en entier.
- **Nombre de tronçons = |position destination − position montée|. Montant = tronçons × tarif.**
- Sens ALLER : destination > montée. Sens RETOUR : destination < montée. Sinon la vente est refusée, de même si montée = destination.
- Aucun ajustement manuel. Le prix vient uniquement du tableau.

### 4.2 Immuabilité de l'historique
- Le prix unitaire, le montant et les tronçons sont copiés dans la vente au moment de la vente.
- Un changement de tarif ou de ligne ne touche que les ventes futures.
- Une vente n'est jamais modifiée ni supprimée.

### 4.3 Erreur de saisie
- **Avant impression** : écran de confirmation (destination et montant) avec bouton « Modifier ». Aucune trace, car rien n'est encore vendu.
- **Après impression** : le ticket ne peut plus être modifié. Seule l'**annulation avec motif obligatoire** existe. Elle laisse une trace dans le journal d'audit. Une vente correcte est ensuite refaite.
- Les ventes annulées sont exclues des recettes.

### 4.4 Réimpression
Elle produit un ticket marqué **DUPLICATA**. Elle ne crée jamais de vente et n'augmente jamais les recettes. Un compteur de duplicata est rattaché à la vente.

### 4.5 Service
Un service associe un receveur, un bus, une ligne et un sens, avec un début et une fin. Un bus peut avoir plusieurs services par jour.

### 4.6 Versement attendu
Chaque bus peut avoir un montant attendu par jour (optionnel). Le tableau de bord affiche l'écart avec les recettes réelles.

---

## 5. Exigences fonctionnelles

### 5.1 Backend
- Authentification, jetons à durée limitée, refresh, permissions par rôle.
- Gestion des transporteurs, utilisateurs, bus, lignes, repères, tarifs, appareils et services.
- Téléchargement de la configuration de service (lignes, repères, tarif en vigueur).
- Synchronisation des ventes **idempotente** : une vente envoyée deux fois n'est jamais doublée. Réponse détaillée par vente (acceptée, déjà reçue, refusée avec raison).
- **Recalcul du montant côté serveur** et rejet si la vente est incohérente avec la règle tarifaire.
- Annulation avec motif obligatoire.
- Rapports : recettes et tickets par jour, bus, ligne et receveur ; total général ; écart recettes/versement ; annulations par receveur.
- Journal d'audit (annulations, changements de tarif, de ligne, de compte).

### 5.2 Administration web (transporteur et administrateur plateforme)
1. **Tableau de bord** : nombre de bus, services du jour, tickets, recettes (jour et période), annulations, écart par bus.
2. **Bus** : création, modification, activation/désactivation, versement attendu. Pas de suppression si le bus a des services.
3. **Lignes et repères** : éditeur ordonné avec validations (noms non vides, positions entières strictement croissantes, au moins deux repères). **Simulateur de prix** pour vérifier le tableau avant usage.
4. **Tarif** : tarif en vigueur, nouveau tarif avec date d'effet, historique, confirmation explicite.
5. **Utilisateurs** : création et désactivation, réinitialisation de mot de passe.
6. **Appareils** : attribution du préfixe unique de numérotation.
7. **Services** : affectation et consultation.
8. **Ventes et tickets** : liste paginée et filtrée, détail, annulation avec motif.
9. **Journal d'audit** : lecture seule avec valeurs avant/après.
10. **Espace plateforme** : liste, création et activation des transporteurs.

### 5.3 Application receveur (Android)
- **Connexion** : identifiant ou téléphone, mot de passe.
- **Ouverture de service** : choix du bus, de la ligne et du sens. Téléchargement de la configuration avant service.
- **Tableau de bord receveur** : bus et ligne actifs, sens, tickets vendus, recettes du jour, état du réseau, état de l'imprimante, compteur de ventes non synchronisées.
- **Nouvelle vente** : choix du repère de montée (par défaut le dernier repère de descente ou le terminus de départ), choix de la destination parmi les repères valides dans le sens, affichage clair du montant, confirmation de l'encaissement, impression.
- **Historique** : tickets du receveur, état de synchronisation, détail, réimpression.
- **Fin de service** : nombre de tickets, recettes, ventilation par nombre de tronçons, déclaration de fin. Alerte si des ventes ne sont pas synchronisées.
- Interface utilisable d'une seule main, rapide aux heures d'affluence, en français, montants en GNF.

---

## 6. Fonctionnement hors ligne

- Une connexion est nécessaire avant le service pour télécharger la configuration. Ensuite, la vente et l'impression fonctionnent sans réseau.
- **Base locale SQLite native** (non effaçable par le navigateur). Une vente enregistrée survit à la fermeture de l'application et au redémarrage du téléphone.
- File d'attente de synchronisation, déclenchée automatiquement au retour du réseau et à chaque ouverture de l'application.
- Une vente locale n'est supprimée qu'**après confirmation du serveur**.
- **Identifiant de vente unique (UUID)** généré sur le téléphone pour la détection des doublons.
- **Numéro de ticket** : préfixe d'appareil attribué par le serveur + compteur local, unique sans réseau.
- **Horloge du téléphone** : le serveur enregistre la date de réception et signale tout écart important avec l'horloge du téléphone.
- Session hors ligne : durée maximale à fixer (**hypothèse : 7 jours**).
- Le tarif modifié n'arrive sur le téléphone qu'à la prochaine synchronisation. Le suivi du transporteur n'est donc pas du temps réel strict.

---

## 7. Impression

- Imprimantes thermiques portables Bluetooth, 58 mm ou 80 mm, protocole ESC/POS.
- **Contenu du ticket** : nom du transporteur, numéro unique, ligne et sens, date et heure, repères de montée et de descente, nombre de tronçons, prix unitaire, montant total en GNF, identifiant du bus, identifiant du receveur, mention DUPLICATA le cas échéant.
- Fonction de test d'impression, réimpression, gestion des accents du français.
- Le module d'impression est isolé pour pouvoir changer de plugin ou de protocole sans toucher au reste.
- **Point d'attention** : la compatibilité n'est pas encore connue, car aucune imprimante n'a été testée. La liste des modèles testés fera partie des livrables.

---

## 8. Sécurité

- Mots de passe hachés, limitation des tentatives de connexion, jetons à durée limitée.
- Validation de toutes les entrées côté serveur.
- **Isolation stricte par transporteur** vérifiée sur chaque requête.
- Aucun secret dans le code, configuration par variables d'environnement.
- Journal d'audit des actions sensibles, sauvegardes régulières de la base.
- Perte d'un téléphone : les ventes non synchronisées sont perdues. C'est un risque connu, atténué par la synchronisation automatique et le compteur visible de ventes en attente.

---

## 9. Architecture technique

- **Backend** : Node.js, Express, Prisma, PostgreSQL.
- **Front** : Nextjs, une seule base de code pour l'admin web (hébergée) et l'application receveur.
- **Application receveur** : React emballé avec **Capacitor** en APK Android, avec SQLite natif et plugin Bluetooth (Classic et BLE).
- **Monorepo** : `/backend`, `/web`, `/docs`. Le calcul des tronçons est un module pur, partagé entre backend et mobile.
- **Risque principal** : les plugins Bluetooth Classic sont communautaires et de maturité variable. Au début de la phase d'impression, un plugin sera choisi et testé. À défaut, un petit plugin natif sera écrit.

**Modèle de données** : Transporteur, Utilisateur, Bus, Ligne, Repère, TarifTransporteur, Appareil, Service, Vente, Annulation, JournalAudit. Toutes les tables métier portent l'identifiant du transporteur.

---

## 10. Exigences non fonctionnelles

- Rapide et lisible en forte affluence, utilisable d'une seule main.
- Français comme langue unique, montants en GNF avec séparateur de milliers, fuseau Africa/Conakry.
- Tolérance aux connexions intermittentes, aucune perte de vente enregistrée.
- Code modulaire, **commenté en français** (quoi et pourquoi).
- Admin web responsive : le transporteur consultera souvent depuis son téléphone.

---

## 11. Tests et recette

- **Unitaires** : calcul des tronçons (aller, retour, destination derrière la montée, même repère, tarif modifié), formatage GNF, validation de l'éditeur de repères.
- **Intégration** : synchronisation d'une même vente envoyée deux fois, isolation entre deux transporteurs, annulation avec et sans motif, recettes excluant les ventes annulées.
- **Réels, à la charge de Gorohitech** : vente complète sur téléphone Android, impression sur l'imprimante, hors ligne puis synchronisation, redémarrage du téléphone avec ventes en attente. Le projet n'est pas considéré comme terminé tant que ces tests n'ont pas été faits.

---

## 12. Découpage en phases

| Phase | Contenu |
|---|---|
| 1 | Backend, modèle, calcul des tronçons, tests |
| 2 | Administration web |
| 3 | Application receveur : vente hors ligne, SQLite, synchronisation, Capacitor |
| 4 | Impression Bluetooth et test d'imprimante |
| 5 | Rapports détaillés, exports Excel/CSV, finitions |
| 6 | GPS (plus tard) |

---

## 13. Livrables

Code source complet commenté, backend fonctionnel, admin web, APK installable, schéma de données, documentation d'installation et de déploiement, documentation des API, tests, guides d'utilisation (receveur et transporteur), liste des imprimantes testées.

---

## 14. Points encore à valider

1. **Annulation** : réservée au transporteur seul, ou le receveur peut-il aussi annuler sa propre vente (avec motif) ? Le transporteur seul est retenu par défaut.
2. **Permissions du gestionnaire** : hypothèse du paragraphe 2 à confirmer.
3. **Durée de session hors ligne** : 7 jours proposés.
4. **Imprimante** : modèle et protocole à tester.
5. **Contrôle des tickets** (QR code vérifiable par un contrôleur à bord) : non retenu pour l'instant.
