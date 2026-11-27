// Les bus portent un code unique par tenant et restent conservés dès qu'un service les référence.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, montantSchema, nomSchema, parseBody } from "../utils/validation.js";
import { auditedUpdate, tenantId } from "./shared.js";

const router = Router();

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
  const tenant = tenantId(request);
  const bus = await prisma.$transaction(async (transaction) => {
    const created = await transaction.bus.create({ data: { transporteurId: tenant, ...input } });
    await auditedUpdate(transaction, request, "Bus", created.id, null, created);
    return created;
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

export default router;
