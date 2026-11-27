// Teste la rotation à usage unique du jeton de renouvellement, transmis via cookie HttpOnly.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString("base64url");
const integrationEnabled = Boolean(process.env.DATABASE_URL);
const { default: app } = await import("../src/app.js");
const { prisma } = await import("../src/db.js");

test("un jeton de renouvellement déjà utilisé est rejeté (détection de réemploi)", { skip: !integrationEnabled }, async () => {
  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 4);
  const carrier = await prisma.transporteur.create({ data: { nom: `Auth ${suffix}` } });
  const user = await prisma.utilisateur.create({
    data: {
      transporteurId: carrier.id,
      login: `auth-${suffix}`,
      nom: "Utilisateur test",
      motDePasseHash: passwordHash,
      role: "TRANSPORTEUR",
    },
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: user.login, motDePasse: password }),
    });
    assert.equal(loginResponse.status, 200);
    const refreshCookie = (loginResponse.headers.get("set-cookie") ?? "").match(/refreshToken=[^;]+/)?.[0];
    assert.ok(refreshCookie, "le cookie de renouvellement doit être posé à la connexion");

    const firstRefresh = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { cookie: refreshCookie },
    });
    assert.equal(firstRefresh.status, 200);
    assert.ok((await firstRefresh.json()).accessToken);

    // Le même cookie, déjà révoqué par la rotation ci-dessus, ne doit plus jamais fonctionner.
    const reuseAttempt = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { cookie: refreshCookie },
    });
    assert.equal(reuseAttempt.status, 401);
    assert.equal((await reuseAttempt.json()).code, "REFRESH_INVALIDE");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$transaction([
      prisma.jetonRefresh.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.utilisateur.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.transporteur.delete({ where: { id: carrier.id } }),
    ]);
  }
});
