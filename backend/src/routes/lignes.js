// L'éditeur de ligne valide tout le tableau avant d'écrire afin d'éviter une configuration partielle.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, nomSchema, parseBody } from "../utils/validation.js";
import { auditedUpdate, tenantId } from "./shared.js";

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

export default router;
