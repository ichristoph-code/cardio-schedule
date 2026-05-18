import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Decide whether SSL should be enabled based on the connection target,
 * not NODE_ENV. Remote hosts (Neon, RDS, etc.) need SSL even in dev/script
 * contexts. Localhost connections skip SSL.
 *
 * Override with PRISMA_FORCE_SSL=1 or PRISMA_DISABLE_SSL=1 if needed.
 */
function shouldUseSsl(connectionString: string): boolean {
  if (process.env.PRISMA_DISABLE_SSL === "1") return false;
  if (process.env.PRISMA_FORCE_SSL === "1") return true;
  try {
    const url = new URL(connectionString);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return true;
  } catch {
    // If the URL doesn't parse, default to SSL — safer for remote DBs.
    return true;
  }
}

function createPrismaClient() {
  // Read DATABASE_URL at first-use time so callers that load dotenv after
  // import-time still work (scripts, tsx with --env-file, etc.).
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. If you're running a script, ensure dotenv is " +
      "loaded before any module that imports prisma — e.g. `import \"dotenv/config\"` " +
      "as the very first line, or run with `node --env-file=.env`.",
    );
  }
  const pool = new pg.Pool({
    connectionString,
    max: 5, // limit pool size for serverless environments
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
  // Cast needed: @prisma/adapter-pg bundles an older @types/pg
  const adapter = new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0]);
  return new PrismaClient({ adapter });
}

/**
 * Lazy proxy: defers client construction (and DATABASE_URL read) until the
 * first property access. This way scripts that call `dotenv.config()` after
 * importing modules which transitively pull in this file still work.
 */
function createLazyPrisma(): PrismaClient {
  let instance: PrismaClient | null = null;
  const getInstance = (): PrismaClient => {
    if (!instance) instance = createPrismaClient();
    return instance;
  };
  return new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
      const client = getInstance();
      const value = Reflect.get(client as object, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createLazyPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
