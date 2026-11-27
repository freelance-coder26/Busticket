// Le journal en lecture seule permet au transporteur de contrôler les actions sensibles de son espace.
import { Router } from "express";
import { prisma } from "../db.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { tenantId } from "./shared.js";

const router = Router();

router.get("/journal-audit", authenticate, authorize("audit"), async (request, response) => {
  const page = Math.max(1, Number.parseInt(request.query.page ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.query.limit ?? "50", 10) || 50));
  const where = { transporteurId: tenantId(request) };
  const [total, evenements] = await prisma.$transaction([
    prisma.journalAudit.count({ where }),
    prisma.journalAudit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  response.json({ page, limite: pageSize, total, evenements });
});

export default router;
