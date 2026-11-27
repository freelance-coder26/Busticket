// Les regroupements utilisent les instantanés de vente afin qu'un changement de ligne ou de bus ne réécrive pas le passé.
import { Router } from "express";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { HttpError } from "../utils/http-error.js";
import { parseDateRange } from "../utils/date-range.js";

const router = Router();

// Le regroupement par jour calendaire reste applicatif : Prisma ne sait pas grouper par date tronquée.
function sumBy(rows, keySelector) {
  const groups = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    const current = groups.get(key) ?? { cle: key, tickets: 0, recettesGnf: 0 };
    current.tickets += 1;
    current.recettesGnf += row.montantGnf;
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => String(left.cle).localeCompare(String(right.cle)));
}

// Les regroupements par bus, ligne et receveur sont poussés en SQL (groupBy) plutôt que chargés puis sommés en JS.
function groupedFromAggregate(groups, keyField) {
  return groups
    .map((group) => ({ cle: group[keyField], tickets: group._count, recettesGnf: group._sum.montantGnf ?? 0 }))
    .sort((left, right) => String(left.cle).localeCompare(String(right.cle)));
}

// L'accès au rapport reste tenant-scopé et les contrôleurs n'obtiennent que la lecture.
router.get("/rapports", authenticate, authorize("rapports"), async (request, response) => {
  if (!request.user.transporteurId) throw new HttpError(403, "Cette opération exige un compte transporteur.", "TENANT_REQUIS");
  const range = parseDateRange(request.query, { defaultToToday: true });
  if (!range) throw new HttpError(400, "La période doit utiliser des dates AAAA-MM-JJ valides.", "PERIODE_INVALIDE");
  const { from, to, start, end } = range;
  const tenant = request.user.transporteurId;
  const activeSalesWhere = {
    transporteurId: tenant,
    vendueAtClient: { gte: start, lt: end },
    annulation: null,
  };

  const [totals, busGroups, lineGroups, receiverGroups, dailyRows, cancellations] = await prisma.$transaction([
    prisma.vente.aggregate({ where: activeSalesWhere, _sum: { montantGnf: true }, _count: true }),
    prisma.vente.groupBy({ by: ["busCode"], where: activeSalesWhere, _sum: { montantGnf: true }, _count: true }),
    prisma.vente.groupBy({ by: ["ligneNom"], where: activeSalesWhere, _sum: { montantGnf: true }, _count: true }),
    prisma.vente.groupBy({ by: ["receveurNom"], where: activeSalesWhere, _sum: { montantGnf: true }, _count: true }),
    prisma.vente.findMany({ where: activeSalesWhere, select: { vendueAtClient: true, montantGnf: true } }),
    prisma.annulation.findMany({
      where: { transporteurId: tenant, annuleeAt: { gte: start, lt: end } },
      include: { vente: { select: { receveurNom: true } } },
    }),
  ]);

  const groupedByDay = sumBy(dailyRows, (sale) => sale.vendueAtClient.toISOString().slice(0, 10));
  const groupedByBus = groupedFromAggregate(busGroups, "busCode");
  const groupedByLine = groupedFromAggregate(lineGroups, "ligneNom");
  const groupedByReceiver = groupedFromAggregate(receiverGroups, "receveurNom");
  const cancellationsByReceiver = new Map();
  for (const cancellation of cancellations) {
    const receiverName = cancellation.vente.receveurNom;
    const current = cancellationsByReceiver.get(receiverName) ?? { receveur: receiverName, annulations: 0 };
    current.annulations += 1;
    cancellationsByReceiver.set(receiverName, current);
  }

  const activeServices = await prisma.service.findMany({
    where: {
      transporteurId: tenant,
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
  const recettesGnf = totals._sum.montantGnf ?? 0;
  const versementAttenduGnf = ecartsParBus.reduce((total, bus) => total + bus.versementAttenduGnf, 0);

  response.json({
    periode: { du: from, au: to },
    total: {
      tickets: totals._count,
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
