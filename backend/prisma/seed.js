// Le jeu de démonstration crée deux tenants indépendants sans intégrer de mot de passe par défaut au dépôt.
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
const password = process.env.DEMO_PASSWORD;
const platformLogin = process.env.PLATFORM_ADMIN_LOGIN?.trim();
const platformPassword = process.env.PLATFORM_ADMIN_PASSWORD;

if (!password || password.length < 12) {
  throw new Error("Définissez DEMO_PASSWORD avec au moins 12 caractères avant de charger les données.");
}
if (Boolean(platformLogin) !== Boolean(platformPassword)) {
  throw new Error("PLATFORM_ADMIN_LOGIN et PLATFORM_ADMIN_PASSWORD doivent être définis ensemble.");
}
if (platformPassword && platformPassword.length < 12) {
  throw new Error("PLATFORM_ADMIN_PASSWORD doit contenir au moins 12 caractères.");
}

const demoTenants = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Transporteur Démo Conakry",
    ownerId: "20000000-0000-4000-8000-000000000001",
    receiverId: "30000000-0000-4000-8000-000000000001",
    busId: "40000000-0000-4000-8000-000000000001",
    lineId: "50000000-0000-4000-8000-000000000001",
    deviceId: "60000000-0000-4000-8000-000000000001",
    prefix: "D1",
    label: "Km 36 — Kaloum",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Transporteur Démo Matoto",
    ownerId: "20000000-0000-4000-8000-000000000002",
    receiverId: "30000000-0000-4000-8000-000000000002",
    busId: "40000000-0000-4000-8000-000000000002",
    lineId: "50000000-0000-4000-8000-000000000002",
    deviceId: "60000000-0000-4000-8000-000000000002",
    prefix: "D2",
    label: "Km 36 — Kaloum",
  },
];

try {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [index, tenant] of demoTenants.entries()) {
    await prisma.$transaction(async (transaction) => {
      await transaction.transporteur.upsert({
        where: { id: tenant.id },
        update: { nom: tenant.name, actif: true },
        create: { id: tenant.id, nom: tenant.name },
      });
      await transaction.utilisateur.upsert({
        where: { id: tenant.ownerId },
        update: { login: `transporteur${index + 1}`, motDePasseHash: passwordHash, actif: true },
        create: {
          id: tenant.ownerId,
          transporteurId: tenant.id,
          login: `transporteur${index + 1}`,
          nom: `Responsable ${index + 1}`,
          motDePasseHash: passwordHash,
          role: "TRANSPORTEUR",
        },
      });
      await transaction.utilisateur.upsert({
        where: { id: tenant.receiverId },
        update: { login: `receveur${index + 1}`, motDePasseHash: passwordHash, actif: true },
        create: {
          id: tenant.receiverId,
          transporteurId: tenant.id,
          login: `receveur${index + 1}`,
          nom: `Receveur ${index + 1}`,
          motDePasseHash: passwordHash,
          role: "RECEVEUR",
        },
      });
      await transaction.bus.upsert({
        where: { id: tenant.busId },
        update: { code: `BUS-${index + 1}`, nom: `Bus Démo ${index + 1}`, actif: true },
        create: {
          id: tenant.busId,
          transporteurId: tenant.id,
          code: `BUS-${index + 1}`,
          nom: `Bus Démo ${index + 1}`,
          versementAttenduGnf: 100000,
        },
      });
      await transaction.ligne.upsert({
        where: { id: tenant.lineId },
        update: { nom: tenant.label, actif: true },
        create: { id: tenant.lineId, transporteurId: tenant.id, nom: tenant.label },
      });

      for (const [stopIndex, stop] of [
        { nom: "Km 36", position: 0 },
        { nom: "Lanssanaya", position: 1 },
        { nom: "Kissosso", position: 3 },
        { nom: "Kaloum", position: 7 },
      ].entries()) {
        await transaction.repere.upsert({
          where: {
            transporteurId_ligneId_position: {
              transporteurId: tenant.id,
              ligneId: tenant.lineId,
              position: stop.position,
            },
          },
          update: { nom: stop.nom },
          create: {
            id: randomUUID(),
            transporteurId: tenant.id,
            ligneId: tenant.lineId,
            ...stop,
          },
        });
      }

      await transaction.tarifTransporteur.upsert({
        where: {
          transporteurId_dateEffet: {
            transporteurId: tenant.id,
            dateEffet: new Date("2026-01-01T00:00:00.000Z"),
          },
        },
        update: { montantGnf: 2000, createdById: tenant.ownerId },
        create: {
          transporteurId: tenant.id,
          montantGnf: 2000,
          dateEffet: new Date("2026-01-01T00:00:00.000Z"),
          createdById: tenant.ownerId,
        },
      });
      await transaction.appareil.upsert({
        where: { id: tenant.deviceId },
        update: { nom: `Appareil Démo ${index + 1}`, actif: true },
        create: {
          id: tenant.deviceId,
          transporteurId: tenant.id,
          prefixeTicket: tenant.prefix,
          nom: `Appareil Démo ${index + 1}`,
          receveurId: tenant.receiverId,
        },
      });
    }, { timeout: 30000 });
  }
  if (platformLogin && platformPassword) {
    const existingAdmin = await prisma.utilisateur.findFirst({
      where: { login: platformLogin, transporteurId: null },
    });
    if (!existingAdmin) {
      await prisma.utilisateur.create({
        data: {
          login: platformLogin,
          nom: process.env.PLATFORM_ADMIN_NAME?.trim() || "Administrateur plateforme",
          motDePasseHash: await bcrypt.hash(platformPassword, 12),
          role: "ADMIN_PLATEFORME",
        },
      });
    }
  }
  console.log("Jeu de démonstration créé pour deux transporteurs.");
} finally {
  await prisma.$disconnect();
}
