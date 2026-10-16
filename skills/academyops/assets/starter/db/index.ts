import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getD1() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

export function getBucket() {
  if (!env.BUCKET) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable.");
  return env.BUCKET;
}

export function getOpenAIKey() {
  return env.OPENAI_API_KEY ?? "";
}

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
