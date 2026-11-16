// Un client Prisma unique réutilise le pool PostgreSQL pendant toute la durée du processus.
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10_000,
    timeout: 10_000,
  },
});
