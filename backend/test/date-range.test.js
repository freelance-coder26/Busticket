// Les bornes de période garantissent que les rapports ne confondent pas une date invalide avec un jour voisin.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDateRange } from "../src/utils/date-range.js";

test("inclut toute la journée de fin dans un intervalle UTC", () => {
  const range = parseDateRange({ du: "2026-11-02", au: "2026-11-03" });
  assert.equal(range.start.toISOString(), "2026-11-02T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-11-04T00:00:00.000Z");
});

test("refuse les dates calendaires impossibles et les intervalles inversés", () => {
  assert.equal(parseDateRange({ du: "2026-02-31" }), null);
  assert.equal(parseDateRange({ du: "2026-11-03", au: "2026-11-02" }), null);
});

test("ne renseigne la période courante que pour les rapports qui le demandent", () => {
  assert.equal(parseDateRange({}), null);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(parseDateRange({}, { defaultToToday: true }).from, today);
});
