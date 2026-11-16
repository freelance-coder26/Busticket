const ACCEPTED_STATUSES = new Set(["ACCEPTEE", "DEJA_RECUE"]);

export async function syncPendingSales(store, sendBatch) {
  const pending = await store.getPendingSales();
  let accepted = 0;
  let refused = 0;

  for (let start = 0; start < pending.length; start += 100) {
    const batch = pending.slice(start, start + 100);
    const response = await sendBatch(batch.map(({ data }) => data));
    const results = new Map((response?.ventes ?? []).map((result) => [result.clientVenteId, result]));

    for (const sale of batch) {
      const result = results.get(sale.data.clientVenteId);
      if (!result) {
        throw new Error(`Le serveur n’a pas confirmé le ticket ${sale.data.numeroTicket}.`);
      }
      if (ACCEPTED_STATUSES.has(result.statut)) {
        await store.markSaleSynced(sale.data.clientVenteId, result);
        accepted += 1;
      } else {
        const reason = result.raison || "Vente refusée par le serveur.";
        await store.markSaleRejected(sale.data.clientVenteId, reason);
        refused += 1;
      }
    }
  }

  return { accepted, refused, remaining: (await store.getPendingSales()).length };
}
