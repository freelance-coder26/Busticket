// Les routes d'authentification délivrent des accès courts et renouvellent les jetons opaques à usage unique.
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { HttpError } from "../utils/http-error.js";
import { parseBody } from "../utils/validation.js";
import { createTokenPair, hashRefreshToken } from "../services/auth-tokens.js";
import { clearRefreshCookie, readRefreshCookie, writeRefreshCookie } from "../utils/cookies.js";
import { REFRESH_TOKEN_TTL_DAYS } from "../config/business.js";

const router = Router();
const loginSchema = z.object({
  login: z.string().trim().min(1).max(120),
  motDePasse: z.string().min(1).max(200),
}).strict();
const REFRESH_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function publicUser(user) {
  return { id: user.id, nom: user.nom, login: user.login, role: user.role, transporteurId: user.transporteurId };
}

// La connexion ne révèle pas si l'identifiant, le mot de passe ou le tenant est incorrect.
router.post("/login", async (request, response) => {
  const input = parseBody(loginSchema, request.body);
  const user = await prisma.utilisateur.findFirst({
    where: { login: input.login },
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
  writeRefreshCookie(response, tokens.refreshToken, REFRESH_TTL_MS);
  response.json({ utilisateur: publicUser(user), accessToken: tokens.accessToken });
});

// Le jeton de renouvellement voyage en cookie HttpOnly ; la rotation révoque l'ancien avant d'émettre un nouveau.
router.post("/refresh", async (request, response) => {
  const refreshToken = readRefreshCookie(request);
  if (!refreshToken) throw new HttpError(401, "Jeton de renouvellement invalide ou expiré.", "REFRESH_INVALIDE");
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
    return { utilisateur: publicUser(stored.utilisateur), tokens };
  });
  writeRefreshCookie(response, result.tokens.refreshToken, REFRESH_TTL_MS);
  response.json({ utilisateur: result.utilisateur, accessToken: result.tokens.accessToken });
});

// La déconnexion invalide uniquement le jeton de renouvellement présenté par le cookie et le vide.
router.post("/logout", authenticate, async (request, response) => {
  const refreshToken = readRefreshCookie(request);
  if (refreshToken) {
    await prisma.jetonRefresh.updateMany({
      where: {
        empreinte: hashRefreshToken(refreshToken),
        utilisateurId: request.user.id,
        revoqueAt: null,
      },
      data: { revoqueAt: new Date() },
    });
  }
  clearRefreshCookie(response);
  response.status(204).end();
});

// Le client récupère le rôle et le tenant depuis la base plutôt que depuis des champs libres.
router.get("/me", authenticate, (request, response) => {
  response.json({ utilisateur: request.user });
});

export default router;
