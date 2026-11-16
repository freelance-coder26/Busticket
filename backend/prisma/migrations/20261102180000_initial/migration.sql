-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN_PLATEFORME', 'TRANSPORTEUR', 'GESTIONNAIRE', 'RECEVEUR', 'CONTROLEUR');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('ALLER', 'RETOUR');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('OUVERT', 'TERMINE');

-- CreateTable
CREATE TABLE "Transporteur" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transporteur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" UUID NOT NULL,
    "transporteurId" UUID,
    "login" TEXT NOT NULL,
    "telephone" TEXT,
    "nom" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bus" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "versementAttenduGnf" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ligne" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repere" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "ligneId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifTransporteur" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "montantGnf" INTEGER NOT NULL,
    "dateEffet" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifTransporteur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appareil" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "prefixeTicket" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "receveurId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "receveurId" UUID NOT NULL,
    "busId" UUID NOT NULL,
    "ligneId" UUID NOT NULL,
    "appareilId" UUID,
    "sens" "Direction" NOT NULL,
    "ligneNomSnapshot" TEXT NOT NULL,
    "busCodeSnapshot" TEXT NOT NULL,
    "reperesSnapshot" JSONB NOT NULL,
    "statut" "ServiceStatus" NOT NULL DEFAULT 'OUVERT',
    "debutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vente" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "clientVenteId" UUID NOT NULL,
    "numeroTicket" TEXT NOT NULL,
    "ligneNom" TEXT NOT NULL,
    "busCode" TEXT NOT NULL,
    "receveurNom" TEXT NOT NULL,
    "monteeNom" TEXT NOT NULL,
    "destinationNom" TEXT NOT NULL,
    "serviceId" UUID NOT NULL,
    "receveurId" UUID NOT NULL,
    "appareilId" UUID NOT NULL,
    "monteeRepereId" UUID NOT NULL,
    "destinationRepereId" UUID NOT NULL,
    "sens" "Direction" NOT NULL,
    "troncons" INTEGER NOT NULL,
    "prixUnitaireGnf" INTEGER NOT NULL,
    "montantGnf" INTEGER NOT NULL,
    "vendueAtClient" TIMESTAMP(3) NOT NULL,
    "recueAtServeur" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duplicataCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Annulation" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "venteId" UUID NOT NULL,
    "auteurId" UUID NOT NULL,
    "motif" TEXT NOT NULL,
    "annuleeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Annulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalAudit" (
    "id" UUID NOT NULL,
    "transporteurId" UUID NOT NULL,
    "acteurId" UUID,
    "action" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT,
    "avant" JSONB,
    "apres" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JetonRefresh" (
    "id" UUID NOT NULL,
    "transporteurId" UUID,
    "utilisateurId" UUID NOT NULL,
    "empreinte" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3) NOT NULL,
    "revoqueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JetonRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transporteur_actif_idx" ON "Transporteur"("actif");

-- CreateIndex
CREATE INDEX "Utilisateur_transporteurId_role_actif_idx" ON "Utilisateur"("transporteurId", "role", "actif");

-- CreateIndex
CREATE INDEX "Utilisateur_telephone_idx" ON "Utilisateur"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_transporteurId_login_key" ON "Utilisateur"("transporteurId", "login");

-- CreateIndex
CREATE INDEX "Bus_transporteurId_actif_idx" ON "Bus"("transporteurId", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_transporteurId_code_key" ON "Bus"("transporteurId", "code");

-- CreateIndex
CREATE INDEX "Ligne_transporteurId_actif_idx" ON "Ligne"("transporteurId", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "Ligne_transporteurId_nom_key" ON "Ligne"("transporteurId", "nom");

-- CreateIndex
CREATE INDEX "Repere_transporteurId_ligneId_idx" ON "Repere"("transporteurId", "ligneId");

-- CreateIndex
CREATE UNIQUE INDEX "Repere_transporteurId_ligneId_position_key" ON "Repere"("transporteurId", "ligneId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Repere_transporteurId_ligneId_nom_key" ON "Repere"("transporteurId", "ligneId", "nom");

-- CreateIndex
CREATE INDEX "TarifTransporteur_transporteurId_dateEffet_idx" ON "TarifTransporteur"("transporteurId", "dateEffet");

-- CreateIndex
CREATE UNIQUE INDEX "TarifTransporteur_transporteurId_dateEffet_key" ON "TarifTransporteur"("transporteurId", "dateEffet");

-- CreateIndex
CREATE INDEX "Appareil_transporteurId_actif_idx" ON "Appareil"("transporteurId", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "Appareil_transporteurId_prefixeTicket_key" ON "Appareil"("transporteurId", "prefixeTicket");

-- CreateIndex
CREATE INDEX "Service_transporteurId_debutAt_idx" ON "Service"("transporteurId", "debutAt");

-- CreateIndex
CREATE INDEX "Service_transporteurId_receveurId_statut_idx" ON "Service"("transporteurId", "receveurId", "statut");

-- CreateIndex
CREATE INDEX "Vente_transporteurId_recueAtServeur_idx" ON "Vente"("transporteurId", "recueAtServeur");

-- CreateIndex
CREATE INDEX "Vente_transporteurId_serviceId_idx" ON "Vente"("transporteurId", "serviceId");

-- CreateIndex
CREATE INDEX "Vente_transporteurId_receveurId_vendueAtClient_idx" ON "Vente"("transporteurId", "receveurId", "vendueAtClient");

-- CreateIndex
CREATE UNIQUE INDEX "Vente_transporteurId_clientVenteId_key" ON "Vente"("transporteurId", "clientVenteId");

-- CreateIndex
CREATE UNIQUE INDEX "Vente_transporteurId_numeroTicket_key" ON "Vente"("transporteurId", "numeroTicket");

-- CreateIndex
CREATE UNIQUE INDEX "Annulation_venteId_key" ON "Annulation"("venteId");

-- CreateIndex
CREATE INDEX "Annulation_transporteurId_annuleeAt_idx" ON "Annulation"("transporteurId", "annuleeAt");

-- CreateIndex
CREATE INDEX "Annulation_transporteurId_auteurId_annuleeAt_idx" ON "Annulation"("transporteurId", "auteurId", "annuleeAt");

-- CreateIndex
CREATE INDEX "JournalAudit_transporteurId_createdAt_idx" ON "JournalAudit"("transporteurId", "createdAt");

-- CreateIndex
CREATE INDEX "JournalAudit_transporteurId_entite_entiteId_idx" ON "JournalAudit"("transporteurId", "entite", "entiteId");

-- CreateIndex
CREATE UNIQUE INDEX "JetonRefresh_empreinte_key" ON "JetonRefresh"("empreinte");

-- CreateIndex
CREATE INDEX "JetonRefresh_transporteurId_utilisateurId_expireAt_idx" ON "JetonRefresh"("transporteurId", "utilisateurId", "expireAt");

-- AddForeignKey
ALTER TABLE "Utilisateur" ADD CONSTRAINT "Utilisateur_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ligne" ADD CONSTRAINT "Ligne_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repere" ADD CONSTRAINT "Repere_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "Ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repere" ADD CONSTRAINT "Repere_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifTransporteur" ADD CONSTRAINT "TarifTransporteur_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifTransporteur" ADD CONSTRAINT "TarifTransporteur_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appareil" ADD CONSTRAINT "Appareil_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appareil" ADD CONSTRAINT "Appareil_receveurId_fkey" FOREIGN KEY ("receveurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_receveurId_fkey" FOREIGN KEY ("receveurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "Ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_appareilId_fkey" FOREIGN KEY ("appareilId") REFERENCES "Appareil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_receveurId_fkey" FOREIGN KEY ("receveurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_appareilId_fkey" FOREIGN KEY ("appareilId") REFERENCES "Appareil"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annulation" ADD CONSTRAINT "Annulation_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annulation" ADD CONSTRAINT "Annulation_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "Vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annulation" ADD CONSTRAINT "Annulation_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAudit" ADD CONSTRAINT "JournalAudit_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAudit" ADD CONSTRAINT "JournalAudit_acteurId_fkey" FOREIGN KEY ("acteurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JetonRefresh" ADD CONSTRAINT "JetonRefresh_transporteurId_fkey" FOREIGN KEY ("transporteurId") REFERENCES "Transporteur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JetonRefresh" ADD CONSTRAINT "JetonRefresh_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
