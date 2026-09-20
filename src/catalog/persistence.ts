import { getDb } from "../kernel/index.js";
import {
  IS_DELETED,
  auditCreate,
  auditDelete,
  auditEdit,
} from "../kernel/soft-delete.js";

export async function listJenisBelanja() {
  return getDb()
    .selectFrom("jenis_belanja")
    .selectAll()
    .where("isDeleted", "=", IS_DELETED.no)
    .orderBy("kode")
    .execute();
}

export async function getJenisBelanja(id: number) {
  return getDb()
    .selectFrom("jenis_belanja")
    .selectAll()
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function createJenisBelanja(input: {
  parent_id: number | null;
  level: number;
  kode: string;
  nama: string;
}) {
  await getDb().insertInto("jenis_belanja").values(input).execute();
}

export async function updateJenisBelanja(
  id: number,
  input: {
    parent_id: number | null;
    level: number;
    kode: string;
    nama: string;
  },
) {
  await getDb()
    .updateTable("jenis_belanja")
    .set(input)
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .execute();
}

export async function deleteJenisBelanja(id: number) {
  await getDb()
    .updateTable("jenis_belanja")
    .set({ isDeleted: IS_DELETED.yes })
    .where("id", "=", id)
    .execute();
}

export async function listSumberDana() {
  return getDb()
    .selectFrom("sumber_dana")
    .selectAll()
    .where("isDeleted", "=", IS_DELETED.no)
    .orderBy("kode")
    .execute();
}

export async function getSumberDana(id: number) {
  return getDb()
    .selectFrom("sumber_dana")
    .selectAll()
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function createSumberDana(input: { kode: string; nama: string }) {
  await getDb().insertInto("sumber_dana").values(input).execute();
}

export async function updateSumberDana(
  id: number,
  input: { kode: string; nama: string },
) {
  await getDb()
    .updateTable("sumber_dana")
    .set(input)
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .execute();
}

export async function deleteSumberDana(id: number) {
  await getDb()
    .updateTable("sumber_dana")
    .set({ isDeleted: IS_DELETED.yes })
    .where("id", "=", id)
    .execute();
}

export async function listMetodePbj() {
  return getDb()
    .selectFrom("metode_pbj")
    .selectAll()
    .where("isDeleted", "=", IS_DELETED.no)
    .orderBy("kode")
    .execute();
}

export async function getMetodePbj(id: number) {
  return getDb()
    .selectFrom("metode_pbj")
    .selectAll()
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function createMetodePbj(input: {
  kode: string;
  metode_pbj_name: string;
}) {
  await getDb().insertInto("metode_pbj").values(input).execute();
}

export async function updateMetodePbj(
  id: number,
  input: { kode: string; metode_pbj_name: string },
) {
  await getDb()
    .updateTable("metode_pbj")
    .set(input)
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .execute();
}

export async function deleteMetodePbj(id: number) {
  await getDb()
    .updateTable("metode_pbj")
    .set({ isDeleted: IS_DELETED.yes })
    .where("id", "=", id)
    .execute();
}

export async function listJenisKontrak() {
  return getDb()
    .selectFrom("jenis_kontrak")
    .selectAll()
    .where("isDeleted", "=", IS_DELETED.no)
    .orderBy("kode")
    .execute();
}

export async function getJenisKontrak(id: number) {
  return getDb()
    .selectFrom("jenis_kontrak")
    .selectAll()
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function createJenisKontrak(input: {
  kode: string;
  jenis_kontrak: string;
}) {
  await getDb().insertInto("jenis_kontrak").values(input).execute();
}

export async function updateJenisKontrak(
  id: number,
  input: { kode: string; jenis_kontrak: string },
) {
  await getDb()
    .updateTable("jenis_kontrak")
    .set(input)
    .where("id", "=", id)
    .where("isDeleted", "=", IS_DELETED.no)
    .execute();
}

export async function deleteJenisKontrak(id: number) {
  await getDb()
    .updateTable("jenis_kontrak")
    .set({ isDeleted: IS_DELETED.yes })
    .where("id", "=", id)
    .execute();
}

/* ------------------------------------------------------------------ */
/* Program kegiatan bidang (operasional → memakai kolom audit)          */
/* ------------------------------------------------------------------ */

type Actor = number | null | undefined;

export async function listProgramKegiatan(bidangId?: number) {
  let q = getDb()
    .selectFrom("program_kegiatan")
    .selectAll()
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("kode_program_kegiatan");
  if (bidangId) q = q.where("bidang_id", "=", bidangId);
  return q.execute();
}

export async function getProgramKegiatan(id: number) {
  return getDb()
    .selectFrom("program_kegiatan")
    .selectAll()
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function createProgramKegiatan(
  input: {
    bidang_id: number;
    kode_program_kegiatan: string;
    program: string;
    kegiatan: string;
    pagu_anggaran: number | null;
  },
  actor?: Actor,
) {
  await getDb()
    .insertInto("program_kegiatan")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}

export async function updateProgramKegiatan(
  id: number,
  input: {
    bidang_id: number;
    kode_program_kegiatan: string;
    program: string;
    kegiatan: string;
    pagu_anggaran: number | null;
  },
  actor?: Actor,
) {
  await getDb()
    .updateTable("program_kegiatan")
    .set({ ...input, ...auditEdit(actor) })
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .execute();
}

export async function deleteProgramKegiatan(id: number, actor?: Actor) {
  await getDb()
    .updateTable("program_kegiatan")
    .set(auditDelete(actor))
    .where("id", "=", id)
    .execute();
}

export async function countCatalogRows() {
  const n = await getDb()
    .selectFrom("jenis_belanja")
    .select(getDb().fn.countAll<number>().as("n"))
    .executeTakeFirst();
  return Number(n?.n ?? 0);
}
