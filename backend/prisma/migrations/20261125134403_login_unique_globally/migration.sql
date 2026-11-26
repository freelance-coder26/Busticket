-- Le login devient unique sur toute la plateforme (et non plus seulement par transporteur),
-- pour permettre une connexion sans avoir à saisir l'identifiant du transporteur.
DROP INDEX "Utilisateur_transporteurId_login_key";

CREATE UNIQUE INDEX "Utilisateur_login_key" ON "Utilisateur"("login");
