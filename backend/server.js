// Le point d'entrée prépare l'écoute HTTP et ferme proprement le pool Prisma à l'arrêt.
import "dotenv/config";
import app from "./src/app.js";
import { prisma } from "./src/db.js";

if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
  throw new Error("JWT_ACCESS_SECRET doit être défini avec au moins 32 caractères.");
}

const port = Number(process.env.PORT ?? 5000);
const server = app.listen(port, () => {
  console.log(`API de billetterie disponible sur le port ${port}.`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
