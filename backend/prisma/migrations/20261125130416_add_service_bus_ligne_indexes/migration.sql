-- CreateIndex
CREATE INDEX "Service_transporteurId_busId_idx" ON "Service"("transporteurId", "busId");

-- CreateIndex
CREATE INDEX "Service_transporteurId_ligneId_idx" ON "Service"("transporteurId", "ligneId");
