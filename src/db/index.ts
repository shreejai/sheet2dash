import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let client: ReturnType<typeof createClient> | undefined;

function createClient(url: string) {
  return drizzle(url, { schema });
}

/** Lazily creates the client so the app can boot before DATABASE_URL is set. */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see .env.example");
  client ??= createClient(url);
  return client;
}
