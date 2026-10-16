import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPool } from "./pool";

const adapter = new PrismaPg(createPool(process.env.DATABASE_URL));

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { Prisma, PrismaClient } from "@prisma/client";
export type * from "@prisma/client";
