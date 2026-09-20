import { config } from "dotenv";
import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import type { Database } from "./tables.js";
import { projectRoot } from "./paths.js";
import { join } from "node:path";

config({ path: join(projectRoot(), ".env") });

let db: Kysely<Database> | undefined;

export function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    "mysql://root:root@127.0.0.1:3306/sirefik"
  );
}

function mysqlPoolOptions() {
  const url = new URL(databaseUrl());
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true as const,
    charset: "utf8mb4",
  };
}

export function getDb(): Kysely<Database> {
  if (!db) {
    db = new Kysely<Database>({
      dialect: new MysqlDialect({
        pool: createPool(mysqlPoolOptions()),
      }),
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = undefined;
  }
}
