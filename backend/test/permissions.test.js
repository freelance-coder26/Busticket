// Cette matrice vérifie les permissions par défaut sans dépendre des contrôles d'affichage du futur frontend.
import test from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS } from "../src/config/business.js";

test("les rôles de gestionnaire et de receveur restent limités", () => {
  assert.deepEqual(PERMISSIONS.tarifs, ["TRANSPORTEUR"]);
  assert.deepEqual(PERMISSIONS.ventesAnnulation, ["TRANSPORTEUR"]);
  assert.equal(PERMISSIONS.rapports.includes("GESTIONNAIRE"), false);
  assert.equal(PERMISSIONS.ventesLecture.includes("RECEVEUR"), true);
  assert.equal(PERMISSIONS.ventesLecture.includes("CONTROLEUR"), true);
});
