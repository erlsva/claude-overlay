import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL?.replace(
  /([?&])sslmode=(?:prefer|require|verify-ca)(?=&|$)/i,
  "$1sslmode=verify-full",
);

/** A single small application pool shared by every Postgres-backed store. */
export const postgres = connectionString
  ? new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    })
  : null;

export const postgresConfigured = () => postgres !== null;
