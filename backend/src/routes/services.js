// Un service est ouvert seulement avec des ressources actives du même transporteur.
import { Router } from "express";
import { z } from "zod";
import { DEFAULT_FARE_GNF, OFFLINE_SESSION_MAX_DAYS } from "../config/business.js";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, parseBody } from "../utils/validation.js";
import { auditedUpdate, tenantId } from "./shared.js";

const router = Router();

router.get("/services", authenticate, authorize("services"), async (request, response) => {
  const tenant = tenantId(request);
  const services = await prisma.service.findMany({
    where: {
      transporteurId: tenant,
      ...(request.user.role === "RECEVEUR" ? { receveurId: request.user.id } : {}),
    },
    include: {
      bus: true,
      ligne: { include: { reperes: { orderBy: { position: "asc" } } } },
      receveur: { select: { id: true, nom: true, login: true } },
    },
    orderBy: { debutAt: "desc" },
  });
  response.json({
    services: services.map((service) => ({
      ...service,
      ligne: {
        ...service.ligne,
        nom: service.ligneNomSnapshot,
        reperes: service.reperesSnapshot,
      },
    })),
  });
});
router.post("/services", authenticate, authorize("services"), async (request, response) => {
  const input = parseBody(z.object({
    receveurId: idSchema.optional(),
    busId: idSchema,
    ligneId: idSchema,
    appareilId: idSchema.optional(),
    sens: z.enum(["ALLER", "RETOUR"]),
  }).strict(), request.body);
  const tenant = tenantId(request);
  const receiverId = request.user.role === "RECEVEUR" ? request.user.id : input.receveurId;
  if (!receiverId) throw new HttpError(400, "Le receveur du service est obligatoire.", "RECEVEUR_REQUIS");
  const [bus, line, receiver, device] = await Promise.all([
    prisma.bus.findFirst({ where: { id: input.busId, transporteurId: tenant, actif: true } }),
    prisma.ligne.findFirst({
      where: { id: input.ligneId, transporteurId: tenant, actif: true },
      include: { reperes: { orderBy: { position: "asc" } } },
    }),
    prisma.utilisateur.findFirst({ where: { id: receiverId, transporteurId: tenant, role: "RECEVEUR", actif: true } }),
    input.appareilId
      ? prisma.appareil.findFirst({
        where: {
          id: input.appareilId,
          transporteurId: tenant,
          actif: true,
          OR: [{ receveurId: null }, { receveurId: receiverId }],
        },
      })
      : Promise.resolve(null),
  ]);
  if (!bus || !line || !receiver || (input.appareilId && !device)) {
    throw new HttpError(400, "Bus, ligne, receveur ou appareil invalide pour ce transporteur.", "CONFIG_SERVICE_INVALIDE");
  }
  const debutAt = new Date();
  const tariff = await prisma.tarifTransporteur.findFirst({
    where: { transporteurId: tenant, dateEffet: { lte: debutAt } },
    orderBy: { dateEffet: "desc" },
  });
  const service = await prisma.$transaction(async (transaction) => {
    const created = await transaction.service.create({
      data: {
        transporteurId: tenant,
        receveurId: receiverId,
        busId: bus.id,
        ligneId: line.id,
        appareilId: device?.id,
        sens: input.sens,
        debutAt,
        ligneNomSnapshot: line.nom,
        busCodeSnapshot: bus.code,
        reperesSnapshot: line.reperes.map(({ id: stopId, nom, position }) => ({ id: stopId, nom, position })),
        tarifUnitaireGnfSnapshot: tariff?.montantGnf ?? DEFAULT_FARE_GNF,
      },
    });
    await auditedUpdate(transaction, request, "Service", created.id, null, created);
    return created;
  });
  response.status(201).json({ service });
});
router.patch("/services/:id", authenticate, authorize("services"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const input = parseBody(z.object({ statut: z.literal("TERMINE") }).strict(), request.body);
  const tenant = tenantId(request);
  const service = await prisma.$transaction(async (transaction) => {
    const before = await transaction.service.findFirst({
      where: {
        id,
        transporteurId: tenant,
        ...(request.user.role === "RECEVEUR" ? { receveurId: request.user.id } : {}),
      },
    });
    if (!before) throw new HttpError(404, "Service introuvable.", "SERVICE_INTROUVABLE");
    if (before.statut === "TERMINE") throw new HttpError(409, "Le service est déjà terminé.", "SERVICE_TERMINE");
    const after = await transaction.service.update({
      where: { id },
      data: { statut: input.statut, finAt: new Date() },
    });
    await auditedUpdate(transaction, request, "Service", id, before, after);
    return after;
  });
  response.json({ service });
});

// La configuration renvoyée est figée pour le service et contient le tarif valide au début de celui-ci.
router.get("/config-service", authenticate, authorize("services"), async (request, response) => {
  const serviceId = parseBody(idSchema, request.query.serviceId);
  const tenant = tenantId(request);
  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      transporteurId: tenant,
      ...(request.user.role === "RECEVEUR" ? { receveurId: request.user.id } : {}),
    },
    include: {
      bus: true,
      ligne: { include: { reperes: { orderBy: { position: "asc" } } } },
      receveur: { select: { id: true, nom: true, login: true } },
      appareil: true,
      transporteur: { select: { nom: true } },
    },
  });
  if (!service) throw new HttpError(404, "Service introuvable.", "SERVICE_INTROUVABLE");
  const tariff = await prisma.tarifTransporteur.findFirst({
    where: { transporteurId: tenant, dateEffet: { lte: service.debutAt } },
    orderBy: { dateEffet: "desc" },
  });
  response.json({
    service: {
      ...service,
      ligne: {
        ...service.ligne,
        nom: service.ligneNomSnapshot,
        reperes: service.reperesSnapshot,
      },
    },
    tarif: {
      montantGnf: service.tarifUnitaireGnfSnapshot ?? tariff?.montantGnf ?? DEFAULT_FARE_GNF,
      dateEffet: tariff?.dateEffet ?? null,
    },
    sessionHorsLigneMaxJours: OFFLINE_SESSION_MAX_DAYS,
    qrCodeControle: false,
  });
});

export default router;
