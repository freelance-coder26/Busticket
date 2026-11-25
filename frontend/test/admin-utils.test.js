import test from "node:test";
import assert from "node:assert/strict";
import { calculateFare } from "../../shared/fare.js";
import {
  formatGnf,
  pagesForRole,
  simulateFare,
  translateApiError,
  validateCancellationReason,
  validateStops,
} from "../../shared/admin-utils.js";

const stops = [
  { id: "a", nom: "Km 36", position: 0 },
  { id: "b", nom: "Kaloum", position: 7 },
];

test("formate les montants GNF sans décimales", () => {
  assert.equal(formatGnf(2000000), "2 000 000 GNF");
});

test("valide les noms, positions entières et l'ordre des repères", () => {
  assert.deepEqual(validateStops(stops), []);
  assert.ok(validateStops([{ nom: "", position: 0 }]).some((error) => error.includes("deux repères")));
  assert.ok(validateStops([
    { nom: "Départ", position: 0 },
    { nom: "Arrivée", position: 0 },
  ]).some((error) => error.includes("strictement croissantes")));
  assert.ok(validateStops([
    { nom: "Départ", position: "x" },
    { nom: "Arrivée", position: 1 },
  ]).some((error) => error.includes("entier")));
});

test("le simulateur délègue au calculateur partagé existant", () => {
  const input = {
    stops,
    boardingStopId: "a",
    destinationStopId: "b",
    direction: "ALLER",
    unitFareGnf: 2500,
  };
  assert.deepEqual(simulateFare(input), calculateFare(input));
  assert.equal(simulateFare(input).amountGnf, 17500);
  assert.throws(() => simulateFare({ ...input, destinationStopId: "a" }), /différentes/);
});

test("les menus affichent uniquement les pages autorisées pour chaque rôle", () => {
  assert.deepEqual(pagesForRole("ADMIN_PLATEFORME").map(({ id }) => id), ["plateforme"]);
  assert.ok(pagesForRole("GESTIONNAIRE").some(({ id }) => id === "bus"));
  assert.equal(pagesForRole("GESTIONNAIRE").some(({ id }) => id === "tarifs"), false);
  assert.deepEqual(pagesForRole("RECEVEUR"), []);
});

test("traduit les erreurs de l'API en français", () => {
  assert.equal(translateApiError("DROITS_INSUFFISANTS"), "Vous n’avez pas les droits nécessaires pour cette action.");
});

test("refuse l'annulation sans motif ou avec un motif trop court", () => {
  assert.notEqual(validateCancellationReason(""), null);
  assert.notEqual(validateCancellationReason("  "), null);
  assert.notEqual(validateCancellationReason("ok"), null);
  assert.equal(validateCancellationReason("Erreur de saisie"), null);
});
