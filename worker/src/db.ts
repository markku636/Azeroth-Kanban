/** 共用 Prisma client 單例（worker 進程內共用一條連線池）。 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { __stockPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__stockPrisma ??
  new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__stockPrisma = prisma;
}
