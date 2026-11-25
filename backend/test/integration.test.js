// La recette API utilise une base PostgreSQL isolée, fournie explicitement par DATABASE_URL.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString("base64url");
const integrationEnabled = Boolean(process.env.DATABASE_URL);
const { default: app } = await import("../src/app.js");
const { prisma } = await import("../src/db.js");

test("le point de santé reflète la connectivité réelle à la base de données", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    if (integrationEnabled) {
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { statut: "ok" });
    } else {
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "BASE_INJOIGNABLE");
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("synchronisation, isolation tenant, annulation et rapports", { skip: !integrationEnabled }, async (context) => {
  const suffix = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const passwordHashModule = await import("bcryptjs");
  const passwordHash = await passwordHashModule.default.hash(password, 4);
  const carrier = await prisma.transporteur.create({ data: { nom: `Test ${suffix}` } });
  const otherCarrier = await prisma.transporteur.create({ data: { nom: `Autre ${suffix}` } });
  const owner = await prisma.utilisateur.create({
    data: {
      transporteurId: carrier.id,
      login: `owner-${suffix}`,
      nom: "Responsable intégration",
      motDePasseHash: passwordHash,
      role: "TRANSPORTEUR",
    },
  });
  const receiver = await prisma.utilisateur.create({
    data: {
      transporteurId: carrier.id,
      login: `receiver-${suffix}`,
      nom: "Receveur intégration",
      motDePasseHash: passwordHash,
      role: "RECEVEUR",
    },
  });
  const otherOwner = await prisma.utilisateur.create({
    data: {
      transporteurId: otherCarrier.id,
      login: `other-${suffix}`,
      nom: "Autre transporteur",
      motDePasseHash: passwordHash,
      role: "TRANSPORTEUR",
    },
  });
  const bus = await prisma.bus.create({
    data: { transporteurId: carrier.id, code: `B-${suffix}`, nom: "Bus de test", versementAttenduGnf: 50000 },
  });
  const line = await prisma.ligne.create({
    data: {
      transporteurId: carrier.id,
      nom: `Ligne ${suffix}`,
      reperes: {
        create: [
          { transporteurId: carrier.id, nom: "Départ", position: 0 },
          { transporteurId: carrier.id, nom: "Arrivée", position: 3 },
        ],
      },
    },
    include: { reperes: true },
  });
  const device = await prisma.appareil.create({
    data: {
      transporteurId: carrier.id,
      prefixeTicket: `T${suffix.slice(0, 4)}`,
      nom: "Appareil de test",
      receveurId: receiver.id,
    },
  });
  const serviceStartedAt = new Date(Date.now() - 60_000);
  await prisma.tarifTransporteur.create({
    data: { transporteurId: carrier.id, montantGnf: 2000, dateEffet: new Date(0) },
  });
  const service = await prisma.service.create({
    data: {
      transporteurId: carrier.id,
      receveurId: receiver.id,
      busId: bus.id,
      ligneId: line.id,
      appareilId: device.id,
      sens: "ALLER",
      debutAt: serviceStartedAt,
      ligneNomSnapshot: line.nom,
      busCodeSnapshot: bus.code,
      reperesSnapshot: line.reperes.map(({ id, nom, position }) => ({ id, nom, position })),
      tarifUnitaireGnfSnapshot: 2000,
    },
  });
  await prisma.tarifTransporteur.create({
    data: { transporteurId: carrier.id, montantGnf: 3000, dateEffet: new Date(Date.now() - 30_000) },
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (account, transporteurId) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ login: account.login, motDePasse: password, transporteurId }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).accessToken;
  };
  const request = (path, token, body) => fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  try {
    const receiverToken = await login(receiver, carrier.id);
    const ownerToken = await login(owner, carrier.id);
    const otherToken = await login(otherOwner, otherCarrier.id);
    const configResponse = await request(`/config-service?serviceId=${service.id}`, receiverToken);
    assert.equal(configResponse.status, 200);
    assert.equal((await configResponse.json()).tarif.montantGnf, 2000);
    const now = new Date();
    const salePayload = (ticketSuffix) => ({
      clientVenteId: randomUUID(),
      numeroTicket: `${device.prefixeTicket}-${ticketSuffix}`,
      serviceId: service.id,
      appareilId: device.id,
      monteeRepereId: line.reperes.find((stop) => stop.position === 0).id,
      destinationRepereId: line.reperes.find((stop) => stop.position === 3).id,
      troncons: 3,
      prixUnitaireGnf: 2000,
      montantGnf: 6000,
      vendueAtClient: now.toISOString(),
    });
    const firstSale = salePayload("1");
    const firstSync = await request("/sync/ventes", receiverToken, { ventes: [firstSale] });
    assert.equal(firstSync.status, 200);
    const firstResult = (await firstSync.json()).ventes[0];
    assert.equal(firstResult.statut, "ACCEPTEE");
    assert.equal(firstResult.montantGnf, 6000);

    const duplicateSync = await request("/sync/ventes", receiverToken, { ventes: [firstSale] });
    assert.equal((await duplicateSync.json()).ventes[0].statut, "DEJA_RECUE");
    const conflictingRetry = await request("/sync/ventes", receiverToken, {
      ventes: [{ ...firstSale, montantGnf: 1 }],
    });
    assert.equal((await conflictingRetry.json()).ventes[0].statut, "REFUSEE");

    const secondSale = salePayload("2");
    const secondSync = await request("/sync/ventes", receiverToken, { ventes: [secondSale] });
    assert.equal((await secondSync.json()).ventes[0].statut, "ACCEPTEE");
    const sales = await prisma.vente.findMany({ where: { transporteurId: carrier.id } });
    assert.equal(sales.length, 2);

    const otherSalesResponse = await request("/ventes", otherToken);
    assert.equal(otherSalesResponse.status, 200);
    assert.equal((await otherSalesResponse.json()).total, 0);

    const missingReason = await fetch(`${baseUrl}/ventes/${sales[0].id}/annulation`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ motif: "" }),
    });
    assert.equal(missingReason.status, 400);
    const forbiddenCancel = await fetch(`${baseUrl}/ventes/${sales[0].id}/annulation`, {
      method: "POST",
      headers: { authorization: `Bearer ${receiverToken}`, "content-type": "application/json" },
      body: JSON.stringify({ motif: "Erreur de saisie" }),
    });
    assert.equal(forbiddenCancel.status, 403);
    const cancellation = await fetch(`${baseUrl}/ventes/${sales[0].id}/annulation`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ motif: "Erreur de saisie" }),
    });
    assert.equal(cancellation.status, 201);

    const day = now.toISOString().slice(0, 10);
    const report = await fetch(`${baseUrl}/rapports?du=${day}&au=${day}`, {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    assert.equal(report.status, 200);
    const reportData = await report.json();
    assert.equal(reportData.total.tickets, 1);
    assert.equal(reportData.total.recettesGnf, 6000);
    assert.equal(reportData.total.ventesAnnulees, 1);
    assert.equal(reportData.total.versementAttenduGnf, 50000);
    assert.equal(reportData.total.ecartGnf, -44000);
    assert.equal(reportData.parLigne[0].cle, line.nom);
    assert.equal(reportData.parBus[0].cle, bus.code);
    assert.equal(reportData.parReceveur[0].cle, receiver.nom);

    const exportQuery = `?du=${day}&au=${day}&format=csv`;
    const csvExport = await request(`/ventes/export${exportQuery}`, ownerToken);
    assert.equal(csvExport.status, 200);
    assert.match(csvExport.headers.get("content-type"), /text\/csv/);
    const csvText = await csvExport.text();
    assert.match(csvText, /ANNULEE/);
    assert.match(csvText, /VALIDEE/);
    assert.match(csvText, /Comptée dans les recettes/);
    const isolatedExport = await request(`/ventes/export${exportQuery}`, otherToken);
    assert.equal(isolatedExport.status, 200);
    assert.doesNotMatch(await isolatedExport.text(), new RegExp(device.prefixeTicket));

    const invalidFormat = await request(`/ventes/export?du=${day}&au=${day}&format=pdf`, ownerToken);
    assert.equal(invalidFormat.status, 400);
    const auditResponse = await request("/journal-audit?limit=100", ownerToken);
    assert.equal(auditResponse.status, 200);
    const auditEvents = (await auditResponse.json()).evenements;
    assert.ok(auditEvents.some((event) => event.action === "BUS_CREE"));
    assert.ok(auditEvents.some((event) => event.action === "SERVICE_CREE"));
    assert.ok(auditEvents.some((event) => event.action === "VENTE_ANNULEE"));
    await context.test("la vente annulée reste persistée sans entrer dans les recettes", () => {
      assert.equal(sales.length, 2);
      assert.equal(reportData.total.recettesGnf, 6000);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const transporteurId of [carrier.id, otherCarrier.id]) {
      await prisma.$transaction([
        prisma.annulation.deleteMany({ where: { transporteurId } }),
        prisma.vente.deleteMany({ where: { transporteurId } }),
        prisma.journalAudit.deleteMany({ where: { transporteurId } }),
        prisma.jetonRefresh.deleteMany({ where: { transporteurId } }),
        prisma.service.deleteMany({ where: { transporteurId } }),
        prisma.repere.deleteMany({ where: { transporteurId } }),
        prisma.ligne.deleteMany({ where: { transporteurId } }),
        prisma.bus.deleteMany({ where: { transporteurId } }),
        prisma.appareil.deleteMany({ where: { transporteurId } }),
        prisma.tarifTransporteur.deleteMany({ where: { transporteurId } }),
        prisma.utilisateur.deleteMany({ where: { transporteurId } }),
        prisma.transporteur.delete({ where: { id: transporteurId } }),
      ]);
    }
  }
});
