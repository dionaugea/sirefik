import { getDb, hashPassword, verifyPassword } from "../kernel/index.js";
import { IS_DELETED, auditCreate, auditEdit } from "../kernel/soft-delete.js";
import type { Role } from "../kernel/tables.js";
import type { Selectable } from "kysely";
import type { UserTable } from "../kernel/tables.js";
import { getBidang } from "../organization/index.js";

type Actor = number | null | undefined;

export async function listUsers() {
  return getDb()
    .selectFrom("users")
    .innerJoin("bidang", "bidang.id", "users.bidang_id")
    .innerJoin("opd", "opd.id", "bidang.id_opd")
    .select([
      "users.id",
      "users.nama_lengkap as nama",
      "users.nip",
      "users.jabatan",
      "users.username",
      "users.role",
      "users.bidang_id",
      "bidang.id_opd as opd_id",
      "bidang.bidang_name as bidang_nama",
      "opd.opd_name as opd_nama",
    ])
    .where("users.is_deleted", "=", IS_DELETED.no)
    .where("opd.is_deleted", "=", IS_DELETED.no)
    .orderBy("users.nama_lengkap")
    .execute();
}

export async function findByUsername(username: string) {
  return getDb()
    .selectFrom("users")
    .selectAll()
    .where("username", "=", username)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function getUserById(id: number) {
  return getDb()
    .selectFrom("users")
    .selectAll()
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

async function assertRoleCardinality(input: {
  role: Role;
  bidang_id: number;
  excludeId?: number;
}) {
  const bidang = await getBidang(input.bidang_id);
  if (!bidang) throw new Error("Bidang tidak ditemukan.");

  if (input.role === "pimpinan") {
    let q = getDb()
      .selectFrom("users")
      .innerJoin("bidang", "bidang.id", "users.bidang_id")
      .select("users.id")
      .where("bidang.id_opd", "=", bidang.id_opd)
      .where("users.role", "=", "pimpinan")
      .where("users.is_deleted", "=", IS_DELETED.no);
    if (input.excludeId) q = q.where("users.id", "!=", input.excludeId);
    if (await q.executeTakeFirst()) {
      throw new Error("Setiap OPD hanya boleh memiliki satu pimpinan.");
    }
  }
  if (input.role === "kepala_bidang") {
    let q = getDb()
      .selectFrom("users")
      .select("id")
      .where("bidang_id", "=", input.bidang_id)
      .where("role", "=", "kepala_bidang")
      .where("is_deleted", "=", IS_DELETED.no);
    if (input.excludeId) q = q.where("id", "!=", input.excludeId);
    if (await q.executeTakeFirst()) {
      throw new Error("Setiap bidang hanya boleh memiliki satu kepala bidang.");
    }
  }
}

export async function updateUser(
  id: number,
  input: {
    bidang_id: number;
    nama: string;
    username: string;
    password?: string;
    nip: string | null;
    jabatan: string | null;
    no_telp: string | null;
    email: string | null;
  },
  actor?: Actor,
) {
  const existing = await getUserById(id);
  if (!existing) throw new Error("Pengguna tidak ditemukan.");
  await assertRoleCardinality({
    role: existing.role,
    bidang_id: input.bidang_id,
    excludeId: id,
  });
  const patch: Record<string, unknown> = {
    bidang_id: input.bidang_id,
    nama_lengkap: input.nama,
    username: input.username,
    nip: input.nip,
    jabatan: input.jabatan,
    no_telp: input.no_telp,
    email: input.email,
    ...auditEdit(actor),
  };
  if (input.password) patch.password_hash = hashPassword(input.password);
  await getDb()
    .updateTable("users")
    .set(patch)
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .execute();
}

export async function createUser(
  input: {
    bidang_id: number;
    nama: string;
    username: string;
    password: string;
    role: Role;
    nip?: string | null;
    jabatan?: string | null;
    no_telp?: string | null;
    email?: string | null;
  },
  actor?: Actor,
): Promise<number> {
  await assertRoleCardinality({
    role: input.role,
    bidang_id: input.bidang_id,
  });
  const row = await getDb()
    .insertInto("users")
    .values({
      bidang_id: input.bidang_id,
      nama_lengkap: input.nama,
      username: input.username,
      password_hash: hashPassword(input.password),
      role: input.role,
      nip: input.nip ?? null,
      jabatan: input.jabatan ?? null,
      no_telp: input.no_telp ?? null,
      email: input.email ?? null,
      ...auditCreate(actor),
    })
    .executeTakeFirstOrThrow();
  return Number(row.insertId);
}

export async function login(
  username: string,
  password: string,
): Promise<Selectable<UserTable> | null> {
  const user = await findByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return user;
}

export async function countUsers(): Promise<number> {
  const row = await getDb()
    .selectFrom("users")
    .select(getDb().fn.countAll<number>().as("n"))
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}
