// Les routes métier appliquent une permission centrale et filtrent toute lecture/écriture par transporteurId.
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { DEFAULT_FARE_GNF, OFFLINE_SESSION_MAX_DAYS } from "../config/business.js";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { writeAudit } from "../services/audit.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, montantSchema, nomSchema, parseBody } from "../utils/validation.js";

const router = Router();
const stopSchema = z.object({
  nom: nomSchema,
  position: z.number().int().safe(),
}).strict();
const lineSchema = z.object({
  nom: nomSchema,
  reperes: z.array(stopSchema).min(2),
}).strict().superRefine((line, context) => {
  for (let index = 1; index < line.reperes.length; index += 1) {
    if (line.reperes[index].position <= line.reperes[index - 1].position) {
      context.addIssue({
        code: "custom",
        path: ["reperes", index, "position"],
        message: "Les positions doivent être strictement croissantes.",
      });
    }
  }
});

// Les ressources rattachées à un transporteur refusent les opérations d'un compte plateforme sans tenant.
function tenantId(request) {
  if (!request.user.transporteurId) {
    throw new HttpError(403, "Cette opération exige un compte transporteur.", "TENANT_REQUIS");
  }
  return request.user.transporteurId;
}

// Les événements d'audit sont écrits dans la même transaction que la modification métier.
async function auditedUpdate(transaction, request, entity, entityId, before, after) {
  await writeAudit(transaction, {
    transporteurId: request.user.transporteurId,
    acteurId: request.user.id,
    action: `${entity.toUpperCase()}_MODIFIE`,
    entite: entity,
    entiteId: entityId,
    avant: before,
    apres: after,
  });
}

// L'espace plateforme ne peut consulter et gérer que les organisations et leurs comptes principaux.
router.get("/transporteurs", authenticate, authorize("transporteurs"), async (_request, response) => {
  response.json({ transporteurs: await prisma.transporteur.findMany({ orderBy: { nom: "asc" } }) });
});
router.post("/transporteurs", authenticate, authorize("transporteurs"), async (request, response) => {
  const input = parseBody(z.object({
    nom: nomSchema,
    loginPrincipal: z.string().trim().min(1).max(120),
    nomPrincipal: nomSchema,
    motDePassePrincipal: z.string().min(12).max(200),
  }).strict(), request.body);
  const passwordHash = await bcrypt.hash(input.motDePassePrincipal, 12);
  const result = await prisma.$transaction(async (transaction) => {
    const transporteur = await transaction.transporteur.create({ data: { nom: input.nom } });
    const primaryUser = await transaction.utilisateur.create({
      data: {
        transporteurId: transporteur.id,
        login: input.loginPrincipal,
        nom: input.nomPrincipal,
        motDePasseHash: passwordHash,
        role: "TRANSPORTEUR",
      },
    });
    await writeAudit(transaction, {
      transporteurId: transporteur.id,
      acteurId: request.user.id,
      action: "TRANSPORTEUR_CREE",
      entite: "Transporteur",
      entiteId: transporteur.id,
      apres: { nom: transporteur.nom, comptePrincipalId: primaryUser.id },
    });
    return { transporteur, comptePrincipal: { id: primaryUser.id, login: primaryUser.login, role: primaryUser.role } };
  });
  response.status(201).json(result);
});
router.patch("/transporteurs/:id", authenticate, authorize("transporteurs"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const input = parseBody(z.object({ nom: nomSchema.optional(), actif: z.boolean().optional() }).strict().refine(
    (value) => Object.keys(value).length > 0,
    "Au moins un champ doit être modifié.",
  ), request.body);
  const result = await prisma.$transaction(async (transaction) => {
    const before = await transaction.transporteur.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, "Transporteur introuvable.", "TRANSPORTEUR_INTROUVABLE");
    const after = await transaction.transporteur.update({ where: { id }, data: input });
    await writeAudit(transaction, {
      transporteurId: id,
      acteurId: request.user.id,
      action: "TRANSPORTEUR_MODIFIE",
      entite: "Transporteur",
      entiteId: id,
      avant: { nom: before.nom, actif: before.actif },
      apres: { nom: after.nom, actif: after.actif },
    });
    return after;
  });
  response.json({ transporteur: result });
});

// Les bus portent un code unique par tenant et restent conservés dès qu'un service les référence.
router.get("/bus", authenticate, authorize("bus"), async (request, response) => {
  response.json({
    bus: await prisma.bus.findMany({
      where: { transporteurId: tenantId(request) },
      orderBy: { code: "asc" },
    }),
  });
});
router.post("/bus", authenticate, authorize("bus"), async (request, response) => {
  const input = parseBody(z.object({
    code: z.string().trim().min(1).max(40),
    nom: nomSchema,
    versementAttenduGnf: montantSchema.nullable().optional(),
  }).strict(), request.body);
  const bus = await prisma.bus.create({
    data: { transporteurId: tenantId(request), ...input },
  });
  response.status(201).json({ bus });
});
router.patch("/bus/:id", authenticate, authorize("bus"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const input = parseBody(z.object({
    code: z.string().trim().min(1).max(40).optional(),
    nom: nomSchema.optional(),
    actif: z.boolean().optional(),
    versementAttenduGnf: montantSchema.nullable().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0), request.body);
  const tenant = tenantId(request);
  const result = await prisma.$transaction(async (transaction) => {
    const before = await transaction.bus.findFirst({ where: { id, transporteurId: tenant } });
    if (!before) throw new HttpError(404, "Bus introuvable.", "BUS_INTROUVABLE");
    const after = await transaction.bus.update({ where: { id }, data: input });
    await auditedUpdate(transaction, request, "Bus", id, before, after);
    return after;
  });
  response.json({ bus: result });
});
router.delete("/bus/:id", authenticate, authorize("bus"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const tenant = tenantId(request);
  await prisma.$transaction(async (transaction) => {
    const bus = await transaction.bus.findFirst({ where: { id, transporteurId: tenant } });
    if (!bus) throw new HttpError(404, "Bus introuvable.", "BUS_INTROUVABLE");
    if (await transaction.service.count({ where: { transporteurId: tenant, busId: id } })) {
      throw new HttpError(409, "Un bus ayant des services ne peut pas être supprimé.", "BUS_AVEC_SERVICES");
    }
    await transaction.bus.delete({ where: { id } });
    await auditedUpdate(transaction, request, "Bus", id, bus, null);
  });
  response.status(204).end();
});

// L'éditeur de ligne valide tout le tableau avant d'écrire afin d'éviter une configuration partielle.
router.get("/lignes", authenticate, authorize("lignes"), async (request, response) => {
  response.json({
    lignes: await prisma.ligne.findMany({
      where: { transporteurId: tenantId(request) },
      include: { reperes: { orderBy: { position: "asc" } } },
      orderBy: { nom: "asc" },
    }),
  });
});
router.post("/lignes", authenticate, authorize("lignes"), async (request, response) => {
  const input = parseBody(lineSchema, request.body);
  const tenant = tenantId(request);
  const line = await prisma.$transaction(async (transaction) => {
    const created = await transaction.ligne.create({
      data: {
        transporteurId: tenant,
        nom: input.nom,
        reperes: { create: input.reperes.map((stop) => ({ transporteurId: tenant, ...stop })) },
      },
      include: { reperes: { orderBy: { position: "asc" } } },
    });
    await auditedUpdate(transaction, request, "Ligne", created.id, null, created);
    return created;
  });
  response.status(201).json({ ligne: line });
});
router.patch("/lignes/:id", authenticate, authorize("lignes"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const input = parseBody(z.object({
    nom: nomSchema.optional(),
    actif: z.boolean().optional(),
    reperes: z.array(stopSchema).min(2).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0), request.body);
  if (input.reperes) {
    for (let index = 1; index < input.reperes.length; index += 1) {
      if (input.reperes[index].position <= input.reperes[index - 1].position) {
        throw new HttpError(400, "Les positions des repères doivent être strictement croissantes.", "REPERES_INVALIDES");
      }
    }
  }
  const tenant = tenantId(request);
  const result = await prisma.$transaction(async (transaction) => {
    const before = await transaction.ligne.findFirst({
      where: { id, transporteurId: tenant },
      include: { reperes: { orderBy: { position: "asc" } } },
    });
    if (!before) throw new HttpError(404, "Ligne introuvable.", "LIGNE_INTROUVABLE");
    const { reperes, ...lineData } = input;
    if (reperes) {
      await transaction.repere.deleteMany({ where: { transporteurId: tenant, ligneId: id } });
      await transaction.repere.createMany({
        data: reperes.map((stop) => ({ transporteurId: tenant, ligneId: id, ...stop })),
      });
    }
    const updated = await transaction.ligne.update({
      where: { id },
      data: lineData,
      include: { reperes: { orderBy: { position: "asc" } } },
    });
    await auditedUpdate(transaction, request, "Ligne", id, before, updated);
    return updated;
  });
  response.json({ ligne: result });
});
router.delete("/lignes/:id", authenticate, authorize("lignes"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const tenant = tenantId(request);
  await prisma.$transaction(async (transaction) => {
    const line = await transaction.ligne.findFirst({ where: { id, transporteurId: tenant } });
    if (!line) throw new HttpError(404, "Ligne introuvable.", "LIGNE_INTROUVABLE");
    if (await transaction.service.count({ where: { transporteurId: tenant, ligneId: id } })) {
      throw new HttpError(409, "Une ligne ayant des services ne peut pas être supprimée.", "LIGNE_AVEC_SERVICES");
    }
    await transaction.repere.deleteMany({ where: { transporteurId: tenant, ligneId: id } });
    await transaction.ligne.delete({ where: { id } });
    await auditedUpdate(transaction, request, "Ligne", id, line, null);
  });
  response.status(204).end();
});

// Un nouveau tarif daté s'ajoute à l'historique et ne modifie jamais les ventes déjà enregistrées.
router.get("/tarifs", authenticate, authorize("tarifs"), async (request, response) => {
  response.json({
    tarifs: await prisma.tarifTransporteur.findMany({
      where: { transporteurId: tenantId(request) },
      orderBy: { dateEffet: "desc" },
    }),
  });
});
router.post("/tarifs", authenticate, authorize("tarifs"), async (request, response) => {
  const input = parseBody(z.object({
    montantGnf: montantSchema,
    dateEffet: z.coerce.date(),
  }).strict(), request.body);
  const tenant = tenantId(request);
  const result = await prisma.$transaction(async (transaction) => {
    const before = await transaction.tarifTransporteur.findFirst({
      where: { transporteurId: tenant, dateEffet: { lte: input.dateEffet } },
      orderBy: { dateEffet: "desc" },
    });
    const tariff = await transaction.tarifTransporteur.create({
      data: { ...input, transporteurId: tenant, createdById: request.user.id },
    });
    await auditedUpdate(transaction, request, "TarifTransporteur", tariff.id, before, tariff);
    return tariff;
  });
  response.status(201).json({ tarif: result });
});

// Les gestionnaires ne peuvent gérer que des comptes receveur, conformément à l'hypothèse validable du cahier.
router.get("/utilisateurs", authenticate, authorize("utilisateurs"), async (request, response) => {
  response.json({
    utilisateurs: await prisma.utilisateur.findMany({
      where: {
        transporteurId: tenantId(request),
        ...(request.user.role === "GESTIONNAIRE" ? { role: "RECEVEUR" } : {}),
      },
      select: { id: true, login: true, telephone: true, nom: true, role: true, actif: true, createdAt: true },
      orderBy: { nom: "asc" },
    }),
  });
});
router.post("/utilisateurs", authenticate, authorize("utilisateurs"), async (request, response) => {
  const input = parseBody(z.object({
    login: z.string().trim().min(1).max(120),
    telephone: z.string().trim().max(40).optional(),
    nom: nomSchema,
    motDePasse: z.string().min(12).max(200),
    role: z.enum(["GESTIONNAIRE", "RECEVEUR", "CONTROLEUR"]),
  }).strict(), request.body);
  if (request.user.role === "GESTIONNAIRE" && input.role !== "RECEVEUR") {
    throw new HttpError(403, "Un gestionnaire ne peut créer que des comptes receveur.", "DROITS_INSUFFISANTS");
  }
  const { motDePasse, ...userData } = input;
  const tenant = tenantId(request);
  const created = await prisma.$transaction(async (transaction) => {
    const user = await transaction.utilisateur.create({
      data: {
        ...userData,
        transporteurId: tenant,
        motDePasseHash: await bcrypt.hash(motDePasse, 12),
      },
      select: { id: true, login: true, telephone: true, nom: true, role: true, actif: true, createdAt: true },
    });
    await writeAudit(transaction, {
      transporteurId: tenant,
      acteurId: request.user.id,
      action: "UTILISATEUR_CREE",
      entite: "Utilisateur",
      entiteId: user.id,
      apres: { login: user.login, nom: user.nom, role: user.role },
    });
    return user;
  });
  response.status(201).json({ utilisateur: created });
});
router.patch("/utilisateurs/:id", authenticate, authorize("utilisateurs"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const input = parseBody(z.object({
    nom: nomSchema.optional(),
    telephone: z.string().trim().max(40).nullable().optional(),
    actif: z.boolean().optional(),
    motDePasse: z.string().min(12).max(200).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0), request.body);
  const tenant = tenantId(request);
  const user = await prisma.$transaction(async (transaction) => {
    const before = await transaction.utilisateur.findFirst({
      where: { id, transporteurId: tenant },
      select: { id: true, login: true, telephone: true, nom: true, role: true, actif: true },
    });
    if (!before) throw new HttpError(404, "Utilisateur introuvable.", "UTILISATEUR_INTROUVABLE");
    const { motDePasse, ...fields } = input;
    if (request.user.role === "GESTIONNAIRE" && before.role !== "RECEVEUR") {
      throw new HttpError(403, "Un gestionnaire ne peut modifier que les comptes receveur.", "DROITS_INSUFFISANTS");
    }
    const updated = await transaction.utilisateur.update({
      where: { id },
      data: {
        ...fields,
        ...(motDePasse ? { motDePasseHash: await bcrypt.hash(motDePasse, 12) } : {}),
      },
      select: { id: true, login: true, telephone: true, nom: true, role: true, actif: true },
    });
    await auditedUpdate(transaction, request, "Utilisateur", id, before, updated);
    return updated;
  });
  response.json({ utilisateur: user });
});

// Les appareils attribués fournissent un préfixe stable pour numéroter les tickets hors connexion.
router.get("/appareils", authenticate, authorize("appareils"), async (request, response) => {
  response.json({
    appareils: await prisma.appareil.findMany({
      where: { transporteurId: tenantId(request) },
      include: { receveur: { select: { id: true, nom: true, login: true } } },
      orderBy: { nom: "asc" },
    }),
  });
});
router.post("/appareils", authenticate, authorize("appareils"), async (request, response) => {
  const input = parseBody(z.object({
    prefixeTicket: z.string().trim().min(1).max(12).regex(/^[A-Z0-9-]+$/),
    nom: nomSchema,
    receveurId: idSchema.nullable().optional(),
  }).strict(), request.body);
  const tenant = tenantId(request);
  if (input.receveurId && !(await prisma.utilisateur.findFirst({
    where: { id: input.receveurId, transporteurId: tenant, role: "RECEVEUR", actif: true },
  }))) {
    throw new HttpError(400, "Le receveur attribué est introuvable ou inactif.", "RECEVEUR_INVALIDE");
  }
  const device = await prisma.appareil.create({ data: { ...input, transporteurId: tenant } });
  response.status(201).json({ appareil: device });
});
router.patch("/appareils/:id", authenticate, authorize("appareils"), async (request, response) => {
  const id = parseBody(idSchema, request.params.id);
  const input = parseBody(z.object({
    nom: nomSchema.optional(),
    actif: z.boolean().optional(),
    receveurId: idSchema.nullable().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0), request.body);
  const tenant = tenantId(request);
  if (input.receveurId && !(await prisma.utilisateur.findFirst({
    where: { id: input.receveurId, transporteurId: tenant, role: "RECEVEUR", actif: true },
  }))) {
    throw new HttpError(400, "Le receveur attribué est introuvable ou inactif.", "RECEVEUR_INVALIDE");
  }
  const result = await prisma.$transaction(async (transaction) => {
    const before = await transaction.appareil.findFirst({ where: { id, transporteurId: tenant } });
    if (!before) throw new HttpError(404, "Appareil introuvable.", "APPAREIL_INTROUVABLE");
    const after = await transaction.appareil.update({ where: { id }, data: input });
    await auditedUpdate(transaction, request, "Appareil", id, before, after);
    return after;
  });
  response.json({ appareil: result });
});

// Un service est ouvert seulement avec des ressources actives du même transporteur.
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
  const service = await prisma.service.create({
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

// Le journal en lecture seule permet au transporteur de contrôler les actions sensibles de son espace.
router.get("/journal-audit", authenticate, authorize("audit"), async (request, response) => {
  const page = Math.max(1, Number.parseInt(request.query.page ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.limit ?? "50", 10) || 50));
  const where = { transporteurId: tenantId(request) };
  const [total, evenements] = await prisma.$transaction([
    prisma.journalAudit.count({ where }),
    prisma.journalAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  response.json({ page, limite: pageSize, total, evenements });
});

export default router;
