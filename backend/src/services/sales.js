// Le serveur recalcule chaque vente avec les repères et le tarif enregistrés, jamais avec le total client.
import { calculateFare } from "../../../shared/fare.js";
import { CLOCK_SKEW_WARNING_MS, DEFAULT_FARE_GNF } from "../config/business.js";
import { HttpError } from "../utils/http-error.js";
import { writeAudit } from "./audit.js";

// Une répétition n'est idempotente que si le UUID représente exactement la même vente.
export function matchesSale(existing, user, input) {
  return (
    existing.receveurId === user.id &&
    existing.appareilId === input.appareilId &&
    existing.serviceId === input.serviceId &&
    existing.numeroTicket === input.numeroTicket &&
    existing.monteeRepereId === input.monteeRepereId &&
    existing.destinationRepereId === input.destinationRepereId &&
    existing.troncons === input.troncons &&
    existing.prixUnitaireGnf === input.prixUnitaireGnf &&
    existing.montantGnf === input.montantGnf &&
    existing.vendueAtClient.getTime() === input.vendueAtClient.getTime()
  );
}

export async function synchronizeSale(transaction, user, input) {
  const existing = await transaction.vente.findFirst({
    where: { transporteurId: user.transporteurId, clientVenteId: input.clientVenteId },
  });
  if (existing) {
    if (!matchesSale(existing, user, input)) {
      throw new HttpError(409, "Cet identifiant client est déjà associé à une autre vente.", "UUID_CLIENT_CONFLIT");
    }
    return { statut: "DEJA_RECUE", venteId: existing.id, numeroTicket: existing.numeroTicket };
  }

  const service = await transaction.service.findFirst({
    where: {
      id: input.serviceId,
      transporteurId: user.transporteurId,
      receveurId: user.id,
    },
  });
  if (!service) throw new HttpError(422, "Service introuvable pour ce receveur.", "SERVICE_INVALIDE");
  if (!Array.isArray(service.reperesSnapshot)) {
    throw new HttpError(500, "La configuration enregistrée du service est invalide.", "CONFIG_SERVICE_INVALIDE");
  }
  const serviceStops = service.reperesSnapshot;

  const device = await transaction.appareil.findFirst({
    where: {
      id: input.appareilId,
      transporteurId: user.transporteurId,
      ...(service.appareilId === input.appareilId
        ? {}
        : { actif: true, OR: [{ receveurId: null }, { receveurId: user.id }] }),
    },
  });
  if (!device) throw new HttpError(422, "Appareil inactif ou non attribué au transporteur.", "APPAREIL_INVALIDE");
  if (service.appareilId && service.appareilId !== input.appareilId) {
    throw new HttpError(422, "L'appareil ne correspond pas à celui du service.", "APPAREIL_INVALIDE");
  }

  const boardingStop = serviceStops.find((stop) => stop.id === input.monteeRepereId);
  const destinationStop = serviceStops.find((stop) => stop.id === input.destinationRepereId);
  if (!boardingStop || !destinationStop) {
    throw new HttpError(422, "Les repères ne font pas partie de la ligne du service.", "REPERE_INVALIDE");
  }

  const fare = service.tarifUnitaireGnfSnapshot === null || service.tarifUnitaireGnfSnapshot === undefined
    ? await transaction.tarifTransporteur.findFirst({
      where: { transporteurId: user.transporteurId, dateEffet: { lte: service.debutAt } },
      orderBy: { dateEffet: "desc" },
    })
    : null;
  const unitFareGnf = service.tarifUnitaireGnfSnapshot ?? fare?.montantGnf ?? DEFAULT_FARE_GNF;
  const calculated = calculateFare({
    stops: serviceStops,
    boardingStopId: boardingStop.id,
    destinationStopId: destinationStop.id,
    direction: service.sens,
    unitFareGnf,
  });

  if (
    input.troncons !== calculated.segments ||
    input.prixUnitaireGnf !== calculated.unitFareGnf ||
    input.montantGnf !== calculated.amountGnf
  ) {
    throw new HttpError(422, "Le tarif envoyé ne correspond pas au calcul serveur.", "TARIF_INCOHERENT");
  }
  if (!input.numeroTicket.startsWith(device.prefixeTicket)) {
    throw new HttpError(422, "Le numéro de ticket ne correspond pas au préfixe de l'appareil.", "TICKET_INVALIDE");
  }

  const sale = await transaction.vente.create({
    data: {
      transporteurId: user.transporteurId,
      clientVenteId: input.clientVenteId,
      numeroTicket: input.numeroTicket,
      ligneNom: service.ligneNomSnapshot,
      busCode: service.busCodeSnapshot,
      receveurNom: user.nom,
      monteeNom: boardingStop.nom,
      destinationNom: destinationStop.nom,
      serviceId: service.id,
      receveurId: user.id,
      appareilId: device.id,
      monteeRepereId: boardingStop.id,
      destinationRepereId: destinationStop.id,
      sens: service.sens,
      troncons: calculated.segments,
      prixUnitaireGnf: calculated.unitFareGnf,
      montantGnf: calculated.amountGnf,
      vendueAtClient: input.vendueAtClient,
    },
  });
  const receivedAt = new Date();
  const clockDifferenceMs = Math.abs(receivedAt.getTime() - input.vendueAtClient.getTime());

  await writeAudit(transaction, {
    transporteurId: user.transporteurId,
    acteurId: user.id,
    action: "VENTE_SYNCHRONISEE",
    entite: "Vente",
    entiteId: sale.id,
    apres: { clientVenteId: sale.clientVenteId, numeroTicket: sale.numeroTicket, montantGnf: sale.montantGnf },
  });

  return {
    statut: "ACCEPTEE",
    venteId: sale.id,
    numeroTicket: sale.numeroTicket,
    montantGnf: sale.montantGnf,
    recueAtServeur: receivedAt.toISOString(),
    ecartHorlogeMs: clockDifferenceMs,
    ecartHorlogeImportant: clockDifferenceMs > CLOCK_SKEW_WARNING_MS,
  };
}
