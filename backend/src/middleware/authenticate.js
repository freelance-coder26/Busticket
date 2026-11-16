// Ce middleware vérifie le jeton avant toute route et construit un contexte de tenant immuable.
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { HttpError } from "../utils/http-error.js";

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET doit contenir au moins 32 caractères.");
  }
  return secret;
}

export async function authenticate(request, _response, next) {
  try {
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new HttpError(401, "Authentification requise.", "AUTHENTIFICATION_REQUISE");

    const claims = jwt.verify(token, accessSecret());
    if (typeof claims !== "object" || typeof claims.sub !== "string") {
      throw new HttpError(401, "Jeton invalide.", "JETON_INVALIDE");
    }

    const user = await prisma.utilisateur.findFirst({
      where: { id: claims.sub, actif: true, transporteurId: claims.transporteurId ?? null },
      select: { id: true, transporteurId: true, login: true, nom: true, role: true, actif: true },
    });
    if (!user || (user.transporteurId && !(await prisma.transporteur.findFirst({
      where: { id: user.transporteurId, actif: true },
      select: { id: true },
    })))) {
      throw new HttpError(401, "Compte inactif ou introuvable.", "COMPTE_INACTIF");
    }

    request.user = user;
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return next(new HttpError(401, "Jeton invalide ou expiré.", "JETON_INVALIDE"));
    }
    return next(error);
  }
}
