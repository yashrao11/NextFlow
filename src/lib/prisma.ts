import { PrismaClient } from '@prisma/client';

/**
 * Global object type assertion to allow persistent caching of the Prisma client 
 * instance across hot-reloads during development.
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Prisma client instance creation.
 * To prevent exceeding database connection limits due to fast-refresh (hot reloading)
 * during development, we cache the instantiated client on the NodeJS global object.
 * 
 * Logging is configured based on environment:
 * - Development: Logs queries, warnings, and errors.
 * - Production: Logs warnings and errors.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// Store client in global object if not running in production
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

