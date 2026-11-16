import test from "node:test";
import assert from "node:assert/strict";
import { MemoryReceiverStore } from "./memory-receiver-store.js";
import { syncPendingSales } from "./receiver-sync.js";

const saleInput = (id, overrides = {}) => ({
  clientVenteId: id,
  prefixeTicket: "R1",
  appareilId: "device-1",
  serviceId: "service-1",
  monteeRepereId: "stop-a",
  destinationRepereId: "stop-b",
  troncons: 1,
  prixUnitaireGnf: 2000,
  montantGnf: 2000,
  vendueAtClient: "2026-11-12T10:00:00.000Z",
  ...overrides,
});

test("les tickets locaux restent uniques même après la création répétée", async () => {
  const store = new MemoryReceiverStore();
  const first = await store.createSale(saleInput("sale-1"));
  const second = await store.createSale(saleInput("sale-2"));
  assert.equal(first.data.numeroTicket, "R1-000001");
  assert.equal(second.data.numeroTicket, "R1-000002");
});

test("un UUID client dupliqué ne crée pas une deuxième vente locale", async () => {
  const store = new MemoryReceiverStore();
  await store.createSale(saleInput("sale-duplicate"));
  await assert.rejects(store.createSale(saleInput("sale-duplicate")), /déjà utilisé/);
  assert.equal((await store.getSales()).length, 1);
});

test("la réimpression incrémente le duplicata sans créer une nouvelle vente", async () => {
  const store = new MemoryReceiverStore();
  await store.createSale(saleInput("sale-reprint"));

  assert.equal(await store.recordDuplicatePrint("sale-reprint"), 1);
  assert.equal(await store.recordDuplicatePrint("sale-reprint"), 2);
  assert.equal((await store.getSales()).length, 1);
  assert.equal((await store.getSales())[0].duplicateCount, 2);
});

test("une réponse perdue après acceptation laisse la vente en attente et la relance est idempotente", async () => {
  const store = new MemoryReceiverStore();
  await store.createSale(saleInput("sale-retry"));
  let calls = 0;

  await assert.rejects(syncPendingSales(store, async () => {
    calls += 1;
    throw new Error("Réseau interrompu avant réception de la réponse.");
  }), /Réseau interrompu/);
  assert.equal((await store.getPendingSales()).length, 1);

  const result = await syncPendingSales(store, async (batch) => {
    calls += 1;
    assert.equal(batch[0].clientVenteId, "sale-retry");
    return { ventes: [{ clientVenteId: "sale-retry", statut: "DEJA_RECUE" }] };
  });
  assert.deepEqual(result, { accepted: 1, refused: 0, remaining: 0 });
  assert.equal(calls, 2);
  assert.equal((await store.getSales())[0].status, "SYNCED");
});

test("une vente refusée demeure stockée localement pour correction", async () => {
  const store = new MemoryReceiverStore();
  await store.createSale(saleInput("sale-refused"));
  const result = await syncPendingSales(store, async () => ({
    ventes: [{ clientVenteId: "sale-refused", statut: "REFUSEE", raison: "Tarif incohérent." }],
  }));
  assert.deepEqual(result, { accepted: 0, refused: 1, remaining: 0 });
  assert.equal(await store.countUnsyncedSales("service-1"), 1);
  assert.equal((await store.getSales())[0].message, "Tarif incohérent.");
});

test("une réponse sans confirmation ne supprime ni ne marque la vente", async () => {
  const store = new MemoryReceiverStore();
  await store.createSale(saleInput("sale-unconfirmed"));
  await assert.rejects(syncPendingSales(store, async () => ({ ventes: [] })), /n’a pas confirmé/);
  assert.equal((await store.getPendingSales()).length, 1);
});
