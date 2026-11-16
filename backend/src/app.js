// L'application Express est exportée séparément du serveur pour rendre les routes testables sans port fixe.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import resourceRoutes from "./routes/resources.js";
import salesRoutes from "./routes/sales.js";
import reportRoutes from "./routes/reports.js";
import { errorHandler } from "./middleware/error-handler.js";

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

// La limitation cible la connexion afin de protéger les mots de passe sans bloquer les renouvellements.
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { erreur: "Trop de tentatives. Réessayez plus tard.", code: "TROP_DE_TENTATIVES" },
}));

app.get("/api/health", (_request, response) => response.json({ statut: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api", resourceRoutes);
app.use("/api", salesRoutes);
app.use("/api", reportRoutes);
app.use((_request, response) => response.status(404).json({ erreur: "Route introuvable.", code: "ROUTE_INTROUVABLE" }));
app.use(errorHandler);

export default app;
