// Les jetons de renouvellement sont opaques et seule leur empreinte est conservée en base.
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_DAYS } from "../config/business.js";

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET doit contenir au moins 32 caractères.");
  }
  return secret;
}

export function hashRefreshToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createTokenPair(transaction, user) {
  const accessToken = jwt.sign(
    { role: user.role, transporteurId: user.transporteurId },
    accessSecret(),
    { subject: user.id, expiresIn: ACCESS_TOKEN_TTL },
  );
  const refreshToken = randomBytes(48).toString("base64url");
  const expireAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await transaction.jetonRefresh.create({
    data: {
      transporteurId: user.transporteurId,
      utilisateurId: user.id,
      empreinte: hashRefreshToken(refreshToken),
      expireAt,
    },
  });
  return { accessToken, refreshToken, expireAt };
}
