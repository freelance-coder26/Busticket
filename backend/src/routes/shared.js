// Utilitaires communs aux routes de ressources, pour éviter de les dupliquer dans chaque fichier.
import { HttpError } from "../utils/http-error.js";
import { writeAudit } from "../services/audit.js";

// Les ressources rattachées à un transporteur refusent les opérations d'un compte plateforme sans tenant.
export function tenantId(request) {
  if (!request.user.transporteurId) {
    throw new HttpError(403, "Cette opération exige un compte transporteur.", "TENANT_REQUIS");
  }
  return request.user.transporteurId;
}

// Les événements d'audit sont écrits dans la même transaction que la modification métier.
export async function auditedUpdate(transaction, request, entity, entityId, before, after) {
  const verb = before === null ? "CREE" : after === null ? "SUPPRIME" : "MODIFIE";
  await writeAudit(transaction, {
    transporteurId: request.user.transporteurId,
    acteurId: request.user.id,
    action: `${entity.toUpperCase()}_${verb}`,
    entite: entity,
    entiteId: entityId,
    avant: before,
    apres: after,
  });
}
