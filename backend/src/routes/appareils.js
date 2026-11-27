// Les appareils attribués fournissent un préfixe stable pour numéroter les tickets hors connexion.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, nomSchema, parseBody } from "../utils/validation.js";
import { auditedUpdate, tenantId } from "./shared.js";

const router = Router();

// Un receveur actif ne peut pas être attribué à deux appareils en même temps.
async function assertReceiverAvailable(tenant, receveurId, excludeAppareilId) {
  const conflict = await prisma.appareil.findFirst({
    where: {
      transporteurId: tenant,
      receveurId,
      actif: true,
      ...(excludeAppareilId ? { id: { not: excludeAppareilId } } : {}),
    },
    select: { nom: true },
  });
  if (conflict) {
    throw new HttpError(409, `Ce receveur est déjà attribué à l'appareil « ${conflict.nom} ».`, "RECEVEUR_DEJA_ATTRIBUE");
  }
}

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
  if (input.receveurId) await assertReceiverAvailable(tenant, input.receveurId);
  const device = await prisma.$transaction(async (transaction) => {
    const created = await transaction.appareil.create({ data: { ...input, transporteurId: tenant } });
    await auditedUpdate(transaction, request, "Appareil", created.id, null, created);
    return created;
  });
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
  if (input.receveurId) await assertReceiverAvailable(tenant, input.receveurId, id);
  const result = await prisma.$transaction(async (transaction) => {
    const before = await transaction.appareil.findFirst({ where: { id, transporteurId: tenant } });
    if (!before) throw new HttpError(404, "Appareil introuvable.", "APPAREIL_INTROUVABLE");
    const after = await transaction.appareil.update({ where: { id }, data: input });
    await auditedUpdate(transaction, request, "Appareil", id, before, after);
    return after;
  });
  response.json({ appareil: result });
});

export default router;
