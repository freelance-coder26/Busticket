// L'espace plateforme ne peut consulter et gérer que les organisations et leurs comptes principaux.
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { writeAudit } from "../services/audit.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, nomSchema, parseBody } from "../utils/validation.js";

const router = Router();

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

export default router;
