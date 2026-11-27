// Un nouveau tarif daté s'ajoute à l'historique et ne modifie jamais les ventes déjà enregistrées.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { montantSchema, parseBody } from "../utils/validation.js";
import { auditedUpdate, tenantId } from "./shared.js";

const router = Router();

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

export default router;
