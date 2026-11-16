// Les routes d'authentification délivrent des accès courts et renouvellent les jetons opaques à usage unique.
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../utils/http-error.js";
import { idSchema, parseBody } from "../utils/validation.js";
import { createTokenPair, hashRefreshToken } from "../services/auth-tokens.js";

const router = Router();
const loginSchema = z.object({
  login: z.string().trim().min(1).max(120),
  motDePasse: z.string().min(1).max(200),
  transporteurId: idSchema.optional(),
}).strict();
const refreshSchema = z.object({ refreshToken: z.string().min(40).max(200) }).strict();

// La connexion ne révèle pas si l'identifiant, le mot de passe ou le tenant est incorrect.
router.post("/login", async (request, response) => {
  const input = parseBody(loginSchema, request.body);
  const user = await prisma.utilisateur.findFirst({
    where: { login: input.login, transporteurId: input.transporteurId ?? null },
  });
  if (!user || !user.actif || !(await bcrypt.compare(input.motDePasse, user.motDePasseHash))) {
    throw new HttpError(401, "Identifiants incorrects.", "IDENTIFIANTS_INVALIDES");
  }
  if (user.transporteurId && !(await prisma.transporteur.findFirst({
    where: { id: user.transporteurId, actif: true },
    select: { id: true },
  }))) {
    throw new HttpError(401, "Identifiants incorrects.", "IDENTIFIANTS_INVALIDES");
  }

  const tokens = await prisma.$transaction((transaction) => createTokenPair(transaction, user));
  response.json({
    utilisateur: { id: user.id, nom: user.nom, login: user.login, role: user.role, transporteurId: user.transporteurId },
    ...tokens,
  });
});

// La rotation révoque l'ancien jeton avant d'en émettre un nouveau dans la même transaction.
router.post("/refresh", async (request, response) => {
  const { refreshToken } = parseBody(refreshSchema, request.body);
  const fingerprint = hashRefreshToken(refreshToken);
  const result = await prisma.$transaction(async (transaction) => {
    const stored = await transaction.jetonRefresh.findUnique({
      where: { empreinte: fingerprint },
      include: { utilisateur: true },
    });
    if (
      !stored ||
      stored.revoqueAt ||
      stored.expireAt <= new Date() ||
      !stored.utilisateur.actif ||
      (stored.transporteurId && !(await transaction.transporteur.findFirst({
        where: { id: stored.transporteurId, actif: true },
        select: { id: true },
      })))
    ) {
      throw new HttpError(401, "Jeton de renouvellement invalide ou expiré.", "REFRESH_INVALIDE");
    }

    const revoked = await transaction.jetonRefresh.updateMany({
      where: { id: stored.id, revoqueAt: null, expireAt: { gt: new Date() } },
      data: { revoqueAt: new Date() },
    });
    if (revoked.count !== 1) {
      throw new HttpError(401, "Jeton de renouvellement déjà utilisé.", "REFRESH_INVALIDE");
    }
    const tokens = await createTokenPair(transaction, stored.utilisateur);
    return {
      utilisateur: {
        id: stored.utilisateur.id,
        nom: stored.utilisateur.nom,
        login: stored.utilisateur.login,
        role: stored.utilisateur.role,
        transporteurId: stored.utilisateur.transporteurId,
      },
      ...tokens,
    };
  });
  response.json(result);
});

// La déconnexion invalide uniquement le jeton de renouvellement présenté.
router.post("/logout", authenticate, async (request, response) => {
  const { refreshToken } = parseBody(refreshSchema, request.body);
  await prisma.jetonRefresh.updateMany({
    where: {
      empreinte: hashRefreshToken(refreshToken),
      utilisateurId: request.user.id,
      revoqueAt: null,
    },
    data: { revoqueAt: new Date() },
  });
  response.status(204).end();
});

// Le client récupère le rôle et le tenant depuis la base plutôt que depuis des champs libres.
router.get("/me", authenticate, (request, response) => {
  response.json({ utilisateur: request.user });
});

export default router;
