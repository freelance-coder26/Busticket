# Guide d'utilisation — receveur

L'application receveur est prévue pour Android et se trouve à `/receveur` dans le client. Elle conserve localement les services et ventes non synchronisées. Se connecter périodiquement en ligne est nécessaire pour renouveler la session et synchroniser.

## Avant le service

1. Vérifier que le téléphone dispose de l'application installée, que la date/heure Android est correcte et que l'accès réseau à l'API est disponible.
2. Se connecter avec le login et le mot de passe fournis par le transporteur.
3. Choisir un service ouvert qui vous est attribué. Vérifier bus, ligne, sens et tarif affichés.
4. Si aucun service n'est proposé, demander au transporteur de vérifier le service, son statut, l'affectation du compte receveur et l'appareil configuré.

## Vendre un ticket

1. Choisir l'arrêt de montée et la destination dans le sens autorisé.
2. Vérifier le nombre de tronçons et le montant calculé, puis confirmer la vente.
3. Donner le ticket imprimé au passager. Si l'imprimante est indisponible, la vente reste enregistrée et peut être réimprimée depuis l'historique.
4. Une réimpression porte la mention `DUPLICATA`; elle ne constitue pas une nouvelle vente.

Le numéro de ticket est créé hors ligne à partir du préfixe de l'appareil. Ne pas supprimer les données de l'application ni réinitialiser son stockage avant que les ventes en attente aient été synchronisées.

## Connexion et synchronisation

- En ligne, les ventes en attente sont envoyées automatiquement. Vérifier dans l'historique que leur état est confirmé avant de quitter le service.
- Hors ligne, continuer à vendre; les données sont gardées dans le stockage local de l'application, puis synchronisées au retour du réseau.
- Un refus de synchronisation reste visible dans l'historique. Ne pas créer un second ticket pour contourner ce refus; transmettre le numéro de ticket au transporteur.
- Avant de terminer un service, examiner l'avertissement de ventes encore en attente. Laisser l'application ouverte lorsque la connexion revient.

## Imprimante Bluetooth

Utiliser une imprimante Bluetooth **BLE GATT** compatible ESC/POS, appairée/détectable et autorisée par Android. Dans la section imprimante, choisir le format papier, rechercher l'imprimante, la connecter puis lancer un ticket de test. Une imprimante Bluetooth Classic uniquement n'est pas prise en charge par l'adaptateur BLE actuel. Consulter [phase-4-bluetooth-printing.md](./phase-4-bluetooth-printing.md) pour la recette matérielle.

En cas d'échec, vérifier Bluetooth, les permissions Android de proximité, la charge de l'imprimante et le format papier. La vente enregistrée n'est pas annulée par un échec d'impression; réimprimer depuis l'historique après reconnexion.
