import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL n'est pas défini (voir .env.example)");
}

export const sqlClient = postgres(url, { max: 10 });
export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
