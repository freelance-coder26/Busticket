// Couvre les routes CRUD de resources.js, seulement effleurées par integration.test.js.
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString("base64url");
const integrationEnabled = Boolean(process.env.DATABASE_URL);
const { default: app } = await import("../src/app.js");
const { prisma } = await import("../src/db.js");

test("routes CRUD de resources.js : permissions, validations et contraintes", { skip: !integrationEnabled }, async () => {
  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const { default: bcrypt } = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 4);

  const carrier = await prisma.transporteur.create({ data: { nom: `Ressources ${suffix}` } });
  const owner = await prisma.utilisateur.create({
    data: { transporteurId: carrier.id, login: `owner-${suffix}`, nom: "Transporteur", motDePasseHash: passwordHash, role: "TRANSPORTEUR" },
  });
  const manager = await prisma.utilisateur.create({
    data: { transporteurId: carrier.id, login: `manager-${suffix}`, nom: "Gestionnaire", motDePasseHash: passwordHash, role: "GESTIONNAIRE" },
  });
  const receiverA = await prisma.utilisateur.create({
    data: { transporteurId: carrier.id, login: `receiverA-${suffix}`, nom: "Receveur A", motDePasseHash: passwordHash, role: "RECEVEUR" },
  });
  const receiverB = await prisma.utilisateur.create({
    data: { transporteurId: carrier.id, login: `receiverB-${suffix}`, nom: "Receveur B", motDePasseHash: passwordHash, role: "RECEVEUR" },
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (account) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: account.login, motDePasse: password }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).accessToken;
  };
  const request = (path, token, method, body) => fetch(`${baseUrl}${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  try {
    const ownerToken = await login(owner);
    const managerToken = await login(manager);

    // Un gestionnaire ne peut créer que des comptes receveur (hypothèse retenue au cahier des charges §2).
    const refusedRole = await request("/utilisateurs", managerToken, "POST", {
      login: `refuse-${suffix}`, nom: "Refusé", motDePasse: "mot-de-passe-12", role: "GESTIONNAIRE",
    });
    assert.equal(refusedRole.status, 403);
    const acceptedRole = await request("/utilisateurs", managerToken, "POST", {
      login: `ok-${suffix}`, nom: "Receveur créé par gestionnaire", motDePasse: "mot-de-passe-12", role: "RECEVEUR",
    });
    assert.equal(acceptedRole.status, 201);

    // Un gestionnaire ne peut pas modifier un compte qui n'est pas un receveur.
    const refusedPatch = await request(`/utilisateurs/${owner.id}`, managerToken, "PATCH", { nom: "Tentative" });
    assert.equal(refusedPatch.status, 403);

    // L'éditeur de ligne refuse des positions non strictement croissantes.
    const invalidLine = await request("/lignes", ownerToken, "POST", {
      nom: `Ligne invalide ${suffix}`,
      reperes: [{ nom: "A", position: 0 }, { nom: "B", position: 0 }],
    });
    assert.equal(invalidLine.status, 400);

    const lineResponse = await request("/lignes", ownerToken, "POST", {
      nom: `Ligne ${suffix}`,
      reperes: [{ nom: "Départ", position: 0 }, { nom: "Arrivée", position: 5 }],
    });
    assert.equal(lineResponse.status, 201);
    const line = (await lineResponse.json()).ligne;
    assert.equal(line.reperes.length, 2);

    // Un bus avec un service ne peut pas être supprimé.
    const busResponse = await request("/bus", ownerToken, "POST", { code: `B-${suffix}`, nom: "Bus de test" });
    assert.equal(busResponse.status, 201);
    const bus = (await busResponse.json()).bus;

    const serviceResponse = await request("/services", ownerToken, "POST", {
      receveurId: receiverA.id, busId: bus.id, ligneId: line.id, sens: "ALLER",
    });
    assert.equal(serviceResponse.status, 201);

    const deleteBus = await request(`/bus/${bus.id}`, ownerToken, "DELETE");
    assert.equal(deleteBus.status, 409);
    assert.equal((await deleteBus.json()).code, "BUS_AVEC_SERVICES");

    // Le préfixe de ticket doit respecter le format attendu par les imprimés hors ligne.
    const invalidDevice = await request("/appareils", ownerToken, "POST", { prefixeTicket: "abc!", nom: "Appareil invalide" });
    assert.equal(invalidDevice.status, 400);

    // Un receveur actif ne peut pas être attribué à deux appareils en même temps.
    const firstDevice = await request("/appareils", ownerToken, "POST", {
      prefixeTicket: `D1${suffix.slice(0, 4).toUpperCase()}`, nom: "Appareil 1", receveurId: receiverB.id,
    });
    assert.equal(firstDevice.status, 201);

    const conflictingDevice = await request("/appareils", ownerToken, "POST", {
      prefixeTicket: `D2${suffix.slice(0, 4).toUpperCase()}`, nom: "Appareil 2", receveurId: receiverB.id,
    });
    assert.equal(conflictingDevice.status, 409);
    assert.equal((await conflictingDevice.json()).code, "RECEVEUR_DEJA_ATTRIBUE");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$transaction([
      prisma.service.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.repere.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.ligne.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.bus.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.appareil.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.journalAudit.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.jetonRefresh.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.utilisateur.deleteMany({ where: { transporteurId: carrier.id } }),
      prisma.transporteur.delete({ where: { id: carrier.id } }),
    ]);
  }
});
