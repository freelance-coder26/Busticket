// Les tests du module pur couvrent les calculs des deux sens et les erreurs métier sans base de données.
import test from "node:test";
import assert from "node:assert/strict";
import { calculateFare } from "../../shared/fare.js";

const stops = [
  { id: "km36", nom: "Km 36", position: 0 },
  { id: "lanssanaya", nom: "Lanssanaya", position: 1 },
  { id: "kissosso", nom: "Kissosso", position: 3 },
  { id: "kaloum", nom: "Kaloum", position: 7 },
];

test("calcule l'aller à partir des positions cumulées", () => {
  assert.deepEqual(
    calculateFare({
      stops,
      boardingStopId: "lanssanaya",
      destinationStopId: "kaloum",
      direction: "ALLER",
      unitFareGnf: 2000,
    }),
    { segments: 6, unitFareGnf: 2000, amountGnf: 12000 },
  );
});

test("calcule le retour avec le même tableau de repères", () => {
  assert.deepEqual(
    calculateFare({
      stops,
      boardingStopId: "kaloum",
      destinationStopId: "kissosso",
      direction: "RETOUR",
      unitFareGnf: 2000,
    }),
    { segments: 4, unitFareGnf: 2000, amountGnf: 8000 },
  );
});

test("refuse une destination située derrière la montée dans le sens choisi", () => {
  assert.throws(
    () => calculateFare({
      stops,
      boardingStopId: "kissosso",
      destinationStopId: "lanssanaya",
      direction: "ALLER",
      unitFareGnf: 2000,
    }),
    /destination n'est pas valide/,
  );
});

test("refuse une montée et une destination au même repère", () => {
  assert.throws(
    () => calculateFare({
      stops,
      boardingStopId: "lanssanaya",
      destinationStopId: "lanssanaya",
      direction: "ALLER",
      unitFareGnf: 2000,
    }),
    /doivent être différentes/,
  );
});

test("refuse une liste de repères dont les positions ne sont pas strictement croissantes", () => {
  assert.throws(
    () => calculateFare({
      stops: [stops[0], stops[2], stops[1], stops[3]],
      boardingStopId: "km36",
      destinationStopId: "kaloum",
      direction: "ALLER",
      unitFareGnf: 2000,
    }),
    /strictement croissants/,
  );
});

test("applique le tarif en vigueur fourni au calcul sans modifier les règles de distance", () => {
  const oldFare = calculateFare({
    stops,
    boardingStopId: "km36",
    destinationStopId: "lanssanaya",
    direction: "ALLER",
    unitFareGnf: 2000,
  });
  const newFare = calculateFare({
    stops,
    boardingStopId: "km36",
    destinationStopId: "lanssanaya",
    direction: "ALLER",
    unitFareGnf: 2500,
  });
  assert.equal(oldFare.amountGnf, 2000);
  assert.equal(newFare.amountGnf, 2500);
});
