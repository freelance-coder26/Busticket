// L'application Express est exportée séparément du serveur pour rendre les routes testables sans port fixe.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import transporteurRoutes from "./routes/transporteurs.js";
import busRoutes from "./routes/bus.js";
import ligneRoutes from "./routes/lignes.js";
import tarifRoutes from "./routes/tarifs.js";
import utilisateurRoutes from "./routes/utilisateurs.js";
import appareilRoutes from "./routes/appareils.js";
import serviceRoutes from "./routes/services.js";
import journalAuditRoutes from "./routes/journal-audit.js";
import salesRoutes from "./routes/sales.js";
import reportRoutes from "./routes/reports.js";
import { errorHandler } from "./middleware/error-handler.js";
import { prisma } from "./db.js";

const app = express();
const allowedOrigins = new Set([
  ...(process.env.WEB_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
]);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
  credentials: true,
}));
app.use(express.json({ limit: "256kb" }));

// Garde-fou de base contre un usage abusif scripté, en plus de la limite stricte sur la connexion.
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { erreur: "Trop de requêtes. Réessayez plus tard.", code: "TROP_DE_REQUETES" },
}));

// La limitation cible la connexion afin de protéger les mots de passe sans bloquer les renouvellements.
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { erreur: "Trop de tentatives. Réessayez plus tard.", code: "TROP_DE_TENTATIVES" },
}));

// La base est interrogée pour que la supervision détecte une base de données injoignable.
app.get("/api/health", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ statut: "ok" });
  } catch {
    response.status(503).json({ statut: "degrade", code: "BASE_INJOIGNABLE" });
  }
});
app.use("/api/auth", authRoutes);
app.use("/api", transporteurRoutes);
app.use("/api", busRoutes);
app.use("/api", ligneRoutes);
app.use("/api", tarifRoutes);
app.use("/api", utilisateurRoutes);
app.use("/api", appareilRoutes);
app.use("/api", serviceRoutes);
app.use("/api", journalAuditRoutes);
app.use("/api", salesRoutes);
app.use("/api", reportRoutes);
app.use((_request, response) => response.status(404).json({ erreur: "Route introuvable.", code: "ROUTE_INTROUVABLE" }));
app.use(errorHandler);

export default app;
