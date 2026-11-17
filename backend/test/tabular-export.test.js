import assert from "node:assert/strict";
import test from "node:test";
import { toCsv, toExcelXml } from "../src/utils/tabular-export.js";

test("CSV quotes separators and neutralizes spreadsheet formulas in text fields", () => {
  const csv = toCsv(["Nom", "Montant"], [['=1+1; "test"', 1200]]);
  assert.match(csv, /^﻿"Nom";"Montant"/);
  assert.match(csv, /"'=1\+1; ""test""";"1200"/);
});

test("Excel XML escapes text and retains numeric cell types", () => {
  const xml = toExcelXml(["Valeur", "Montant"], [["<bus & ligne>", 1200]]);
  assert.match(xml, /&lt;bus &amp; ligne&gt;/);
  assert.match(xml, /ss:Type="Number">1200/);
  assert.match(xml, /ss:Type="String">Valeur/);
});
