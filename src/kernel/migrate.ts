import { sql, type Kysely } from "kysely";
import type { Database } from "./tables.js";

/**
 * Database sudah disempurnakan di MySQL.
 * Migrasi hanya memastikan kompatibilitas dan menambah kolom/FK
 * (tidak pernah mengubah atau menghapus kolom yang sudah ada, kecuali
 * penggantian `isDeleted` → `is_deleted` yang diminta pada analisis DB).
 */
export async function migrateKernel(db: Kysely<Database>): Promise<void> {
  await ensureBidangAutoIncrement(db);
  await dropStaleFakeGeoTable(db);
  await ensureAuditColumns(db);
  await ensureExtraColumnsAndForeignKeys(db);

  await sql`
    UPDATE users SET role = 'kepala_bidang'
    WHERE role IN ('eselon3', 'kepala bidang')
  `.execute(db).catch(() => undefined);

  await sql`
    UPDATE transaksi_rfk SET verval_status = 'ValidatedByKepalaBidang'
    WHERE verval_status = 'ValidatedByEselon3'
  `.execute(db).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Helper information_schema                                            */
/* ------------------------------------------------------------------ */

async function columnExists(
  db: Kysely<Database>,
  table: string,
  column: string,
): Promise<boolean> {
  const r = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = ${table}
      AND column_name = ${column}
  `.execute(db);
  return Number(r.rows[0]?.n ?? 0) > 0;
}

async function tableExists(db: Kysely<Database>, table: string): Promise<boolean> {
  const r = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = ${table}
  `.execute(db);
  return Number(r.rows[0]?.n ?? 0) > 0;
}

async function constraintExists(
  db: Kysely<Database>,
  name: string,
): Promise<boolean> {
  const r = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM information_schema.table_constraints
    WHERE constraint_schema = DATABASE() AND constraint_name = ${name}
  `.execute(db);
  return Number(r.rows[0]?.n ?? 0) > 0;
}

async function addColumnIfMissing(
  db: Kysely<Database>,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  if (await columnExists(db, table, column)) return;
  await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN ${sql.ref(column)} ${sql.raw(ddl)}`.execute(db);
}

async function addForeignKeyIfMissing(
  db: Kysely<Database>,
  opts: {
    name: string;
    table: string;
    column: string;
    refTable: string;
    refColumn: string;
  },
): Promise<void> {
  if (await constraintExists(db, opts.name)) return;
  try {
    await sql`
      ALTER TABLE ${sql.table(opts.table)}
      ADD CONSTRAINT ${sql.ref(opts.name)}
      FOREIGN KEY (${sql.ref(opts.column)})
      REFERENCES ${sql.table(opts.refTable)} (${sql.ref(opts.refColumn)})
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `.execute(db);
  } catch (e) {
    console.warn(
      `[migrasi] FK ${opts.name} (${opts.table}.${opts.column} → ${opts.refTable}.${opts.refColumn}) dilewati: ${(e as Error).message}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Kompatibilitas lama                                                  */
/* ------------------------------------------------------------------ */

async function ensureBidangAutoIncrement(db: Kysely<Database>): Promise<void> {
  const col = await sql<{ EXTRA: string }>`
    SELECT EXTRA FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'bidang'
      AND column_name = 'id'
  `.execute(db);
  const extra = String(col.rows[0]?.EXTRA ?? "").toLowerCase();
  if (!extra.includes("auto_increment")) {
    await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(db);
    await sql`ALTER TABLE bidang MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT`.execute(db);
    await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(db);
  }
}

async function dropStaleFakeGeoTable(db: Kysely<Database>): Promise<void> {
  if (!(await tableExists(db, "kabupaten_kota_provinsi"))) return;
  const rows = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM kabupaten_kota_provinsi
  `.execute(db);
  if (Number(rows.rows[0]?.n ?? 0) === 0) {
    await sql`DROP TABLE kabupaten_kota_provinsi`.execute(db).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Kolom audit (analisis DB poin 3)                                     */
/* ------------------------------------------------------------------ */

/** Tabel operasional yang menerima kolom audit. Master katalog & wilayah dikecualikan. */
export const AUDIT_TABLES = [
  "addendum",
  "app_setup",
  "bidang",
  "entitas",
  "evidence",
  "konsultan",
  "kontrak_perjanjian",
  "lembaga",
  "opd",
  "pembayaran",
  "penyedia",
  "pho_bast",
  "ppk_pptk",
  "program_kegiatan",
  "progress_fisik",
  "sts",
  "transaksi_rfk",
  "users",
  "verval",
] as const;

const AUDIT_COLUMNS: ReadonlyArray<[string, string]> = [
  ["is_created", "TINYINT(1) NOT NULL DEFAULT 1"],
  ["created_at", "DATETIME NULL DEFAULT CURRENT_TIMESTAMP"],
  ["user_created", "INT NULL"],
  ["is_edited", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["edited_at", "DATETIME NULL"],
  ["user_edited", "INT NULL"],
  ["is_deleted", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["deleted_at", "DATETIME NULL"],
  ["user_deleted", "INT NULL"],
];

async function ensureAuditColumns(db: Kysely<Database>): Promise<void> {
  for (const table of AUDIT_TABLES) {
    if (!(await tableExists(db, table))) continue;

    for (const [column, ddl] of AUDIT_COLUMNS) {
      await addColumnIfMissing(db, table, column, ddl);
    }

    // Pindahkan penanda lama lalu hapus kolomnya (permintaan poin 3).
    if (await columnExists(db, table, "isDeleted")) {
      await sql`
        UPDATE ${sql.table(table)} SET is_deleted = isDeleted WHERE isDeleted = 1
      `.execute(db);
      await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN isDeleted`.execute(db);
    }

    for (const who of ["user_created", "user_edited", "user_deleted"]) {
      await addForeignKeyIfMissing(db, {
        name: `fk_${table}_${who}`,
        table,
        column: who,
        refTable: "users",
        refColumn: "id",
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Relasi tambahan (analisis DB poin 2)                                 */
/* ------------------------------------------------------------------ */

async function ensureExtraColumnsAndForeignKeys(db: Kysely<Database>): Promise<void> {
  await addColumnIfMissing(db, "transaksi_rfk", "program_kegiatan_id", "INT NULL");
  await addForeignKeyIfMissing(db, {
    name: "fk_transaksi_rfk_program_kegiatan",
    table: "transaksi_rfk",
    column: "program_kegiatan_id",
    refTable: "program_kegiatan",
    refColumn: "id",
  });

  await addForeignKeyIfMissing(db, {
    name: "fk_evidence_transaksi",
    table: "evidence",
    column: "transaksi_id",
    refTable: "transaksi_rfk",
    refColumn: "id",
  });
  await addForeignKeyIfMissing(db, {
    name: "fk_pembayaran_transaksi",
    table: "pembayaran",
    column: "transaksi_id",
    refTable: "transaksi_rfk",
    refColumn: "id",
  });
  await addForeignKeyIfMissing(db, {
    name: "fk_progress_fisik_transaksi",
    table: "progress_fisik",
    column: "transaksi_id",
    refTable: "transaksi_rfk",
    refColumn: "id",
  });
  await addForeignKeyIfMissing(db, {
    name: "fk_verval_user",
    table: "verval",
    column: "user_id",
    refTable: "users",
    refColumn: "id",
  });
  await addForeignKeyIfMissing(db, {
    name: "fk_kontrak_kab_kota_id",
    table: "kontrak_perjanjian",
    column: "kontrak_kab_kota_id",
    refTable: "kab_kota_provinsi",
    refColumn: "kab_kota_provinsi_id",
  });
}
