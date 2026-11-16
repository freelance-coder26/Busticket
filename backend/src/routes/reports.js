// Les agrégats excluent les ventes annulées des recettes tout en les détaillant par receveur.
import { Router } from "express";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { HttpError } from "../utils/http-error.js";
import { parseDateRange } from "../utils/date-range.js";

const router = Router();

// Les regroupements utilisent les instantanés de vente afin qu'un changement de ligne ou de bus ne réécrive pas le passé.
function sumBy(sales, keySelector) {
  const groups = new Map();
  for (const sale of sales) {
    const key = keySelector(sale);
    const current = groups.get(key) ?? { cle: key, tickets: 0, recettesGnf: 0 };
    current.tickets += 1;
    current.recettesGnf += sale.montantGnf;
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => String(left.cle).localeCompare(String(right.cle)));
}

// L'accès au rapport reste tenant-scopé et les contrôleurs n'obtiennent que la lecture.
router.get("/rapports", authenticate, authorize("rapports"), async (request, response) => {
  if (!request.user.transporteurId) throw new HttpError(403, "Cette opération exige un compte transporteur.", "TENANT_REQUIS");
  const range = parseDateRange(request.query, { defaultToToday: true });
  if (!range) throw new HttpError(400, "La période doit utiliser des dates AAAA-MM-JJ valides.", "PERIODE_INVALIDE");
  const { from, to, start, end } = range;
  const [sales, cancellations] = await prisma.$transaction([
    prisma.vente.findMany({
      where: {
        transporteurId: request.user.transporteurId,
        vendueAtClient: { gte: start, lt: end },
      },
      include: { annulation: true },
      orderBy: { vendueAtClient: "asc" },
    }),
    prisma.annulation.findMany({
      where: {
        transporteurId: request.user.transporteurId,
        annuleeAt: { gte: start, lt: end },
      },
      include: { vente: { select: { receveurNom: true } } },
    }),
  ]);
  const activeSales = sales.filter((sale) => !sale.annulation);
  const groupedByDay = sumBy(activeSales, (sale) => sale.vendueAtClient.toISOString().slice(0, 10));
  const groupedByBus = sumBy(activeSales, (sale) => sale.busCode);
  const groupedByLine = sumBy(activeSales, (sale) => sale.ligneNom);
  const groupedByReceiver = sumBy(activeSales, (sale) => sale.receveurNom);
  const cancellationsByReceiver = new Map();
  for (const cancellation of cancellations) {
    const receiverName = cancellation.vente.receveurNom;
    const current = cancellationsByReceiver.get(receiverName) ?? { receveur: receiverName, annulations: 0 };
    current.annulations += 1;
    cancellationsByReceiver.set(receiverName, current);
  }

  const activeServices = await prisma.service.findMany({
    where: {
      transporteurId: request.user.transporteurId,
      debutAt: { gte: start, lt: end },
    },
    select: { debutAt: true, busId: true, bus: { select: { code: true, versementAttenduGnf: true } } },
  });
  const revenueByBus = new Map(groupedByBus.map((group) => [group.cle, group.recettesGnf]));
  const expectedByBus = new Map();
  for (const service of activeServices) {
    if (service.bus.versementAttenduGnf !== null) {
      const current = expectedByBus.get(service.bus.code) ?? {
        montantJournalierGnf: service.bus.versementAttenduGnf,
        joursActifs: new Set(),
      };
      current.joursActifs.add(service.debutAt.toISOString().slice(0, 10));
      expectedByBus.set(service.bus.code, current);
    }
  }
  const ecartsParBus = [...expectedByBus].map(([busCode, expected]) => {
    const versementAttenduGnf = expected.montantJournalierGnf * expected.joursActifs.size;
    return {
      busCode,
      versementAttenduGnf,
      recettesGnf: revenueByBus.get(busCode) ?? 0,
      ecartGnf: (revenueByBus.get(busCode) ?? 0) - versementAttenduGnf,
    };
  });
  const recettesGnf = activeSales.reduce((total, sale) => total + sale.montantGnf, 0);
  const versementAttenduGnf = ecartsParBus.reduce((total, bus) => total + bus.versementAttenduGnf, 0);

  response.json({
    periode: { du: from, au: to },
    total: {
      tickets: activeSales.length,
      recettesGnf,
      ventesAnnulees: cancellations.length,
      versementAttenduGnf,
      ecartGnf: recettesGnf - versementAttenduGnf,
    },
    parJour: groupedByDay,
    parBus: groupedByBus,
    parLigne: groupedByLine,
    parReceveur: groupedByReceiver,
    ecartsParBus,
    annulationsParReceveur: [...cancellationsByReceiver.values()],
  });
});

export default router;
