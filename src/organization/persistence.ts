import { getDb } from "../kernel/index.js";
import {
  IS_DELETED,
  auditCreate,
  auditDelete,
  auditEdit,
} from "../kernel/soft-delete.js";

type Actor = number | null | undefined;

/* ------------------------------------------------------------------ */
/* Entitas                                                              */
/* ------------------------------------------------------------------ */

export async function getEntitas() {
  return getDb()
    .selectFrom("entitas")
    .leftJoin("provinsi", "provinsi.provinsi_id", "entitas.id_provinsi")
    .selectAll("entitas")
    .select("provinsi.provinsi_name as provinsi")
    .where("entitas.is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function upsertEntitas(
  input: {
    entitas_name: string;
    id_provinsi: number;
    alamat: string | null;
    tahun_berdiri: number | null;
    file_logo_entitas: string | null;
  },
  actor?: Actor,
): Promise<void> {
  const existing = await getEntitas();
  if (existing) {
    await getDb()
      .updateTable("entitas")
      .set({ ...input, ...auditEdit(actor) })
      .where("id", "=", existing.id)
      .where("is_deleted", "=", IS_DELETED.no)
      .execute();
  } else {
    await getDb()
      .insertInto("entitas")
      .values({ ...input, ...auditCreate(actor) })
      .execute();
  }
}

/* ------------------------------------------------------------------ */
/* OPD                                                                  */
/* ------------------------------------------------------------------ */

export async function listOpd() {
  return getDb()
    .selectFrom("opd")
    .selectAll()
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("opd_name")
    .execute();
}

export async function getOpd(id: number) {
  return getDb()
    .selectFrom("opd")
    .selectAll()
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function createOpd(
  input: {
    id_entitas: number;
    opd_name: string;
    tugas_fungsi: string | null;
    alamat_kantor: string | null;
    no_telp: string | null;
    email: string | null;
  },
  actor?: Actor,
) {
  await getDb()
    .insertInto("opd")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}

export async function updateOpd(
  id: number,
  input: {
    opd_name: string;
    tugas_fungsi: string | null;
    alamat_kantor: string | null;
    no_telp: string | null;
    email: string | null;
  },
  actor?: Actor,
) {
  await getDb()
    .updateTable("opd")
    .set({ ...input, ...auditEdit(actor) })
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .execute();
}

export function isSekretariat(nama: string): boolean {
  return nama.trim().toLowerCase() === "sekretariat";
}

/* ------------------------------------------------------------------ */
/* Bidang                                                               */
/* ------------------------------------------------------------------ */

export async function listBidang(opdId?: number) {
  let q = getDb()
    .selectFrom("bidang")
    .selectAll()
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("bidang_name");
  if (opdId) q = q.where("id_opd", "=", opdId);
  return q.execute();
}

export async function getBidang(id: number) {
  return getDb()
    .selectFrom("bidang")
    .selectAll()
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function countBidang(opdId?: number): Promise<number> {
  let q = getDb()
    .selectFrom("bidang")
    .select(getDb().fn.countAll<number>().as("n"))
    .where("is_deleted", "=", IS_DELETED.no);
  if (opdId) q = q.where("id_opd", "=", opdId);
  const row = await q.executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function createBidang(
  input: {
    id_opd: number;
    bidang_name: string;
    bidang_fungsi: string;
  },
  actor?: Actor,
) {
  const nama = input.bidang_name.trim();
  const fungsi = input.bidang_fungsi.trim() || "-";
  if (!nama) throw new Error("Nama bidang wajib diisi.");

  await getDb()
    .insertInto("bidang")
    .values({
      id_opd: input.id_opd,
      bidang_name: nama,
      bidang_fungsi: fungsi,
      ...auditCreate(actor),
    })
    .execute();
}

export async function softDeleteBidang(id: number, actor?: Actor) {
  await getDb()
    .updateTable("bidang")
    .set(auditDelete(actor))
    .where("id", "=", id)
    .execute();
}

/* ------------------------------------------------------------------ */
/* Master wilayah (hanya-baca)                                          */
/* ------------------------------------------------------------------ */

export async function listProvinsi() {
  return getDb()
    .selectFrom("provinsi")
    .selectAll()
    .orderBy("provinsi_name")
    .execute();
}

export async function listKabKota(provinsiId: number) {
  return getDb()
    .selectFrom("kab_kota_provinsi")
    .selectAll()
    .where("provinsi_id", "=", provinsiId)
    .orderBy("kab_kota_provinsi_nama")
    .execute();
}

export async function listKecamatan(kabKotaId: number) {
  return getDb()
    .selectFrom("kecamatan_distrik")
    .selectAll()
    .where("kab_kota_provinsi_id", "=", kabKotaId)
    .orderBy("kecamatan_distrik_name")
    .execute();
}

export async function listDesaByKecamatan(kecamatanId: number) {
  return getDb()
    .selectFrom("desa_kelurahan")
    .selectAll()
    .where("kecamatan_distrik_id", "=", kecamatanId)
    .orderBy("desa_kelurahan_name")
    .execute();
}

export async function getProvinsi(id: number) {
  return getDb()
    .selectFrom("provinsi")
    .selectAll()
    .where("provinsi_id", "=", id)
    .executeTakeFirst();
}

export async function getKabKota(id: number) {
  return getDb()
    .selectFrom("kab_kota_provinsi")
    .selectAll()
    .where("kab_kota_provinsi_id", "=", id)
    .executeTakeFirst();
}

export async function getKecamatan(id: number) {
  return getDb()
    .selectFrom("kecamatan_distrik")
    .selectAll()
    .where("kecamatan_distrik_id", "=", id)
    .executeTakeFirst();
}

export async function getDesa(id: number) {
  return getDb()
    .selectFrom("desa_kelurahan")
    .selectAll()
    .where("desa_kelurahan_id", "=", id)
    .executeTakeFirst();
}

export async function listDesaKelurahan() {
  return getDb()
    .selectFrom("desa_kelurahan")
    .selectAll()
    .orderBy("desa_kelurahan_name")
    .limit(500)
    .execute();
}
