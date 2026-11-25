// Les gestionnaires ne peuvent gérer que des comptes receveur, conformément à l'hypothèse validable du cahier.
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { writeAudit } from "../services/audit.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, nomSchema, parseBody } from "../utils/validation.js";
import { tenantId } from "./shared.js";

const router = Router();

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
    await writeAudit(transaction, {
      transporteurId: tenant,
      acteurId: request.user.id,
      action: "UTILISATEUR_MODIFIE",
      entite: "Utilisateur",
      entiteId: id,
      avant: before,
      apres: { ...updated, motDePasseModifie: Boolean(motDePasse) },
    });
    return updated;
  });
  response.json({ utilisateur: user });
});

export default router;
