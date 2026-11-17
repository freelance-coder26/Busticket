// Les routes de vente séparent la synchronisation idempotente et l'annulation, sans exposer de modification.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { writeAudit } from "../services/audit.js";
import { matchesSale, synchronizeSale } from "../services/sales.js";
import { HttpError } from "../utils/http-error.js";
import { toCsv, toExcelXml } from "../utils/tabular-export.js";
import { idSchema, parseBody } from "../utils/validation.js";
import { parseDateRange } from "../utils/date-range.js";

const router = Router();
const saleInputSchema = z.object({
  clientVenteId: idSchema,
  numeroTicket: z.string().trim().min(2).max(80),
  serviceId: idSchema,
  appareilId: idSchema,
  monteeRepereId: idSchema,
  destinationRepereId: idSchema,
  troncons: z.number().int().positive(),
  prixUnitaireGnf: z.number().int().positive(),
  montantGnf: z.number().int().positive(),
  vendueAtClient: z.coerce.date(),
}).strict();
const syncSchema = z.object({ ventes: z.array(z.unknown()).min(1).max(100) }).strict();
const cancelSchema = z.object({ motif: z.string().trim().min(3, "Le motif est obligatoire.").max(500) }).strict();

// Chaque vente échoue indépendamment afin que l'appareil garde une réponse exploitable par identifiant.
router.post("/sync/ventes", authenticate, async (request, response) => {
  if (request.user.role !== "RECEVEUR") {
    throw new HttpError(403, "Seul un receveur peut synchroniser des ventes.", "DROITS_INSUFFISANTS");
  }
  const input = parseBody(syncSchema, request.body);
  const results = [];

  for (const rawSale of input.ventes) {
    const parsed = saleInputSchema.safeParse(rawSale);
    if (!parsed.success) {
      results.push({
        clientVenteId: typeof rawSale?.clientVenteId === "string" ? rawSale.clientVenteId : null,
        statut: "REFUSEE",
        raison: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      });
      continue;
    }

    try {
      const result = await prisma.$transaction((transaction) => synchronizeSale(transaction, request.user, parsed.data));
      results.push({ clientVenteId: parsed.data.clientVenteId, ...result });
    } catch (error) {
      if (error.code === "P2002") {
        const duplicate = await prisma.vente.findFirst({
          where: { transporteurId: request.user.transporteurId, clientVenteId: parsed.data.clientVenteId },
          select: {
            id: true,
            numeroTicket: true,
            receveurId: true,
            appareilId: true,
            serviceId: true,
            monteeRepereId: true,
            destinationRepereId: true,
            troncons: true,
            prixUnitaireGnf: true,
            montantGnf: true,
            vendueAtClient: true,
          },
        });
        if (duplicate) {
          results.push(matchesSale(duplicate, request.user, parsed.data)
            ? {
              clientVenteId: parsed.data.clientVenteId,
              statut: "DEJA_RECUE",
              venteId: duplicate.id,
              numeroTicket: duplicate.numeroTicket,
            }
            : {
              clientVenteId: parsed.data.clientVenteId,
              statut: "REFUSEE",
              code: "UUID_CLIENT_CONFLIT",
              raison: "Cet identifiant client est déjà associé à une autre vente.",
            });
          continue;
        }
        results.push({
          clientVenteId: parsed.data.clientVenteId,
          statut: "REFUSEE",
          code: "DOUBLON",
          raison: "Le numéro de ticket est déjà utilisé.",
        });
        continue;
      }
      if (error.status && error.status < 500) {
        results.push({ clientVenteId: parsed.data.clientVenteId, statut: "REFUSEE", raison: error.message, code: error.code });
        continue;
      }
      throw error;
    }
  }
  response.json({ ventes: results });
});

// Les ventes sont paginées et toujours filtrées par le tenant du jeton, jamais par un tenant fourni en URL.
router.get("/ventes", authenticate, authorize("ventesLecture"), async (request, response) => {
  const page = Math.max(1, Number.parseInt(request.query.page ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.limit ?? "25", 10) || 25));
  const serviceFilter = {
    ...(request.query.busId ? { busId: parseBody(idSchema, request.query.busId) } : {}),
    ...(request.query.ligneId ? { ligneId: parseBody(idSchema, request.query.ligneId) } : {}),
  };
  const receiverId = request.user.role === "RECEVEUR"
    ? request.user.id
    : request.query.receveurId
      ? parseBody(idSchema, request.query.receveurId)
      : undefined;
  const range = request.query.du !== undefined || request.query.au !== undefined
    ? parseDateRange(request.query)
    : null;
  if ((request.query.du !== undefined || request.query.au !== undefined) && !range) {
    throw new HttpError(400, "La période doit utiliser des dates AAAA-MM-JJ valides.", "PERIODE_INVALIDE");
  }
  const where = {
    transporteurId: request.user.transporteurId,
    ...(receiverId ? { receveurId: receiverId } : {}),
    ...(Object.keys(serviceFilter).length ? { service: serviceFilter } : {}),
    ...(range ? { vendueAtClient: { gte: range.start, lt: range.end } } : {}),
    ...(request.query.annulee === "true" ? { annulation: { isNot: null } } : {}),
    ...(request.query.annulee === "false" ? { annulation: null } : {}),
  };
  const [total, ventes] = await prisma.$transaction([
    prisma.vente.count({ where }),
    prisma.vente.findMany({
      where,
      orderBy: { recueAtServeur: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { annulation: true },
    }),
  ]);
  response.json({ page, limite: pageSize, total, ventes });
});

// L'export inclut les ventes annulées pour traçabilité, avec un indicateur qui les exclut des recettes.
router.get("/ventes/export", authenticate, authorize("ventesLecture"), async (request, response) => {
  if (!request.user.transporteurId) {
    throw new HttpError(403, "Cette opération exige un compte transporteur.", "TENANT_REQUIS");
  }
  const range = parseDateRange(request.query);
  if (!range || request.query.du === undefined || request.query.au === undefined) {
    throw new HttpError(400, "Une période valide du/au au format AAAA-MM-JJ est obligatoire.", "PERIODE_INVALIDE");
  }
  if (request.query.format !== "csv" && request.query.format !== "excel") {
    throw new HttpError(400, "Le format doit être csv ou excel.", "FORMAT_INVALIDE");
  }
  const serviceFilter = {
    ...(request.query.busId ? { busId: parseBody(idSchema, request.query.busId) } : {}),
    ...(request.query.ligneId ? { ligneId: parseBody(idSchema, request.query.ligneId) } : {}),
  };
  const where = {
    transporteurId: request.user.transporteurId,
    vendueAtClient: { gte: range.start, lt: range.end },
    ...(request.user.role === "RECEVEUR"
      ? { receveurId: request.user.id }
      : request.query.receveurId
        ? { receveurId: parseBody(idSchema, request.query.receveurId) }
        : {}),
    ...(Object.keys(serviceFilter).length ? { service: serviceFilter } : {}),
  };
  const sales = await prisma.vente.findMany({
    where,
    include: { annulation: true },
    orderBy: { vendueAtClient: "asc" },
  });
  const headers = [
    "Ticket", "Date de vente", "Ligne", "Bus", "Receveur", "Montée", "Destination",
    "Tronçons", "Tarif unitaire GNF", "Montant GNF", "Statut", "Comptée dans les recettes",
    "Motif annulation", "Date annulation",
  ];
  const rows = sales.map((sale) => [
    sale.numeroTicket,
    sale.vendueAtClient.toISOString(),
    sale.ligneNom,
    sale.busCode,
    sale.receveurNom,
    sale.monteeNom,
    sale.destinationNom,
    sale.troncons,
    sale.prixUnitaireGnf,
    sale.montantGnf,
    sale.annulation ? "ANNULEE" : "VALIDEE",
    sale.annulation ? "NON" : "OUI",
    sale.annulation?.motif ?? "",
    sale.annulation?.annuleeAt?.toISOString() ?? "",
  ]);
  const filePrefix = `ventes-${range.from}-${range.to}`;
  if (request.query.format === "csv") {
    response
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="${filePrefix}.csv"`)
      .send(toCsv(headers, rows));
    return;
  }
  response
    .set("Content-Type", "application/vnd.ms-excel; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="${filePrefix}.xls"`)
    .send(toExcelXml(headers, rows));
});

// Le détail d'une vente suit la même règle d'isolation et ne fournit aucun endpoint de modification.
router.get("/ventes/:id", authenticate, authorize("ventesLecture"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const vente = await prisma.vente.findFirst({
    where: {
      id,
      transporteurId: request.user.transporteurId,
      ...(request.user.role === "RECEVEUR" ? { receveurId: request.user.id } : {}),
    },
    include: { annulation: true },
  });
  if (!vente) throw new HttpError(404, "Vente introuvable.", "VENTE_INTROUVABLE");
  response.json({ vente });
});

// Un motif est exigé et le rôle est vérifié côté serveur avant de préserver la vente et son historique.
router.post("/ventes/:id/annulation", authenticate, authorize("ventesAnnulation"), async (request, response) => {
  const venteId = parseBody(idSchema, request.params.id);
  const { motif } = parseBody(cancelSchema, request.body);
  const annulation = await prisma.$transaction(async (transaction) => {
    const sale = await transaction.vente.findFirst({
      where: { id: venteId, transporteurId: request.user.transporteurId },
      include: { annulation: true },
    });
    if (!sale) throw new HttpError(404, "Vente introuvable.", "VENTE_INTROUVABLE");
    if (sale.annulation) throw new HttpError(409, "Cette vente est déjà annulée.", "VENTE_DEJA_ANNULEE");

    const created = await transaction.annulation.create({
      data: {
        transporteurId: request.user.transporteurId,
        venteId: sale.id,
        auteurId: request.user.id,
        motif,
      },
    });
    await writeAudit(transaction, {
      transporteurId: request.user.transporteurId,
      acteurId: request.user.id,
      action: "VENTE_ANNULEE",
      entite: "Vente",
      entiteId: sale.id,
      avant: { montantGnf: sale.montantGnf, annulee: false },
      apres: { annulee: true, motif },
    });
    return created;
  });
  response.status(201).json({ annulation });
});

export default router;
