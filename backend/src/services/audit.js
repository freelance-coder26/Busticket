// Les événements sensibles conservent leurs valeurs avant/après pour rendre les changements vérifiables.
function jsonSnapshot(value) {
  return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value));
}

export function writeAudit(transaction, { transporteurId, acteurId, action, entite, entiteId, avant, apres }) {
  if (!transporteurId) throw new TypeError("Chaque événement d'audit doit appartenir à un transporteur.");
  return transaction.journalAudit.create({
    data: {
      transporteurId,
      acteurId: acteurId ?? null,
      action,
      entite,
      entiteId: entiteId ?? null,
      avant: avant === undefined ? undefined : jsonSnapshot(avant),
      apres: apres === undefined ? undefined : jsonSnapshot(apres),
    },
  });
}
