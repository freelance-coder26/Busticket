import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTestPrintBytes,
  buildTicketBytes,
  encodePc858,
  formatTicketLines,
} from "./escpos.js";

const ticket = {
  carrierName: "Transporteur Démo Conakry",
  ticketNumber: "D1-000001",
  lineName: "Km 36 - Kaloum",
  direction: "ALLER",
  soldAt: "2026-11-13T10:00:00.000Z",
  boardingStop: "Lanssanaya",
  destinationStop: "Kaloum",
  segments: 6,
  unitFareGnf: 2000,
  amountGnf: 12000,
  busCode: "BUS-1",
  receiverLogin: "receveur1",
  receiverName: "Receveur Démo",
};

function containsBytes(haystack, needle) {
  return haystack.some((_, start) => needle.every((byte, offset) => haystack[start + offset] === byte));
}

test("génère les octets ESC/POS d'un ticket normal sans mention de duplicata", () => {
  const bytes = buildTicketBytes(ticket, { widthMm: 58 });
  const output = Array.from(bytes);

  assert.deepEqual(output.slice(0, 5), [0x1b, 0x40, 0x1b, 0x74, 19]);
  assert.equal(containsBytes(output, encodePc858("DUPLICATA")), false);
  assert.equal(containsBytes(output, encodePc858("D1-000001")), true);
});

test("marque explicitement les réimpressions comme DUPLICATA", () => {
  const normal = buildTicketBytes(ticket);
  const duplicate = buildTicketBytes(ticket, { duplicate: true });

  assert.notDeepEqual(duplicate, normal);
  assert.equal(containsBytes(Array.from(duplicate), encodePc858("DUPLICATA")), true);
  assert.equal(formatTicketLines(ticket, { duplicate: true }).includes("*** DUPLICATA ***"), true);
});

test("encode les accents français en PC858", () => {
  assert.deepEqual(
    Array.from(encodePc858("éèêëàâäçîïôöùûüÉÈÇ")),
    [0x82, 0x8a, 0x88, 0x89, 0x85, 0x83, 0x84, 0x87, 0x8c, 0x8b, 0x93, 0x94, 0x97, 0x96, 0x81, 0x90, 0xd4, 0x80],
  );
  assert.equal(encodePc858("e\u0301")[0], 0x82);
});

test("adapte le retour à la ligne aux largeurs 58 mm et 80 mm", () => {
  for (const [widthMm, columns] of [[58, 32], [80, 48]]) {
    const lines = formatTicketLines({ ...ticket, carrierName: "Transporteur avec un nom exceptionnellement long à Conakry" }, { widthMm });
    assert.ok(lines.every((line) => encodePc858(line).length <= columns));
    assert.ok(buildTicketBytes(ticket, { widthMm }) instanceof Uint8Array);
  }
});

test("génère une page de test avec les accents sans vente", () => {
  const bytes = buildTestPrintBytes(80);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.includes(0x82), true);
  assert.equal(formatTicketLines(ticket, { widthMm: 80 }).includes("Ticket : D1-000001"), true);
});
