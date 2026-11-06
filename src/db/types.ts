import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Base de données, réelle (postgres-js) ou de test (PGlite). Les services la reçoivent en paramètre. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
