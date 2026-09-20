import { getDb } from "../kernel/index.js";
import {
  IS_DELETED,
  auditCreate,
  auditEdit,
} from "../kernel/soft-delete.js";
import type { AuthUser } from "../kernel/index.js";
import type { VervalStatus } from "../kernel/tables.js";
import {
  getBidang,
  getDesa,
  getKabKota,
  getKecamatan,
  isSekretariat,
} from "../organization/index.js";

type Actor = number | null | undefined;

/** Batas INT MySQL untuk kolom `kontrak_desa_kelurahan_id` (tipe kolom tidak diubah). */
const INT_MAX = 2_147_483_647;

export function nilaiBerlaku(
  nilaiKontrak: string | number | null | undefined,
  addendaRows: { nilai_baru: string | number | null }[],
): number {
  if (addendaRows.length === 0) return Number(nilaiKontrak ?? 0);
  return Number(addendaRows[addendaRows.length - 1]!.nilai_baru);
}

export function persenKeuangan(
  nilai: number,
  pembayaranRows: { nilai: string | number }[],
): number {
  if (nilai <= 0) return 0;
  const bayar = pembayaranRows.reduce((s, p) => s + Number(p.nilai), 0);
  return Math.round((bayar / nilai) * 10000) / 100;
}

export function persenFisik(progress: { persen: string | number }[]): number {
  if (progress.length === 0) return 0;
  return Number(progress[progress.length - 1]!.persen);
}

export function terlambat(
  tanggalSelesai: string,
  pho: { jenis: string }[],
): boolean {
  const done = pho.some((p) => p.jenis === "PHO" || p.jenis === "BAST");
  if (done) return false;
  return new Date(tanggalSelesai) < new Date();
}

export async function getKontrak(id: number) {
  return getDb()
    .selectFrom("kontrak_perjanjian")
    .selectAll()
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

export async function listRfk(user: AuthUser) {
  let q = getDb()
    .selectFrom("transaksi_rfk")
    .innerJoin(
      "kontrak_perjanjian",
      "kontrak_perjanjian.id",
      "transaksi_rfk.kontrak_id",
    )
    .innerJoin("bidang", "bidang.id", "transaksi_rfk.bidang_id")
    .innerJoin("opd", "opd.id", "bidang.id_opd")
    .select([
      "transaksi_rfk.id",
      "transaksi_rfk.bidang_id",
      "transaksi_rfk.kontrak_id",
      "transaksi_rfk.jenis_belanja_id",
      "transaksi_rfk.program_kegiatan_id",
      "transaksi_rfk.progress_fisik",
      "transaksi_rfk.progress_keuangan",
      "transaksi_rfk.verval_status",
      "kontrak_perjanjian.kontrak_no",
      "kontrak_perjanjian.kontrak_nama_paket",
      "kontrak_perjanjian.kontrak_nilai",
      "kontrak_perjanjian.kontrak_tanggal",
      "kontrak_perjanjian.kontrak_tanggal_selesai",
      "bidang.id_opd as opd_id",
      "bidang.bidang_name as bidang_nama",
      "opd.opd_name as opd_nama",
    ])
    .where("transaksi_rfk.is_deleted", "=", IS_DELETED.no)
    .where("opd.is_deleted", "=", IS_DELETED.no)
    .orderBy("transaksi_rfk.id", "desc");

  if (user.role === "administrator") {
    // semua
  } else if (user.role === "pimpinan") {
    q = q.where("bidang.id_opd", "=", user.opd_id);
  } else if (await userIsSekretariat(user)) {
    q = q.where("bidang.id_opd", "=", user.opd_id);
  } else {
    q = q.where("transaksi_rfk.bidang_id", "=", user.bidang_id);
  }
  return q.execute();
}

export async function getRfk(id: number) {
  return getDb()
    .selectFrom("transaksi_rfk")
    .selectAll()
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
}

/** Isian paket (kontrak + transaksi) dari form. PPK/PPTK merujuk `users.id`. */
export type PaketInput = {
  kontrak_jenis_id: number;
  kontrak_no: string;
  kontrak_nama_paket: string;
  kontrak_tanggal: string | null;
  kontrak_tanggal_mulai: string | null;
  kontrak_tanggal_selesai: string | null;
  kontrak_jangka_waktu: number | null;
  kontrak_hps: number | null;
  kontrak_nilai: number | null;
  kontrak_lembaga: number | null;
  kontrak_penyedia: number | null;
  kontrak_pengawas: number | null;
  kontrak_keterangan: string | null;
  kontrak_provinsi_id: number;
  kontrak_kab_kota_id: number;
  kontrak_desa_kelurahan_id: number;
  jenis_belanja_id: number;
  sumber_dana_id: number;
  metode_pbj_id: number;
  program_kegiatan_id: number | null;
  ppk: number;
  pptk: number;
  catatan: string | null;
};

async function validateLokasi(input: PaketInput) {
  const kab = await getKabKota(input.kontrak_kab_kota_id);
  if (!kab || kab.provinsi_id !== input.kontrak_provinsi_id) {
    throw new Error("Kabupaten/kota tidak sesuai dengan provinsi yang dipilih.");
  }
  const desa = await getDesa(input.kontrak_desa_kelurahan_id);
  if (!desa) throw new Error("Desa/kelurahan tidak valid.");
  const kec = await getKecamatan(desa.kecamatan_distrik_id);
  if (!kec || kec.kab_kota_provinsi_id !== input.kontrak_kab_kota_id) {
    throw new Error("Desa/kelurahan tidak berada di kabupaten/kota yang dipilih.");
  }
  if (input.kontrak_desa_kelurahan_id > INT_MAX) {
    throw new Error(
      "Kode desa/kelurahan melebihi kapasitas kolom kontrak_desa_kelurahan_id (INT). Hubungi administrator database.",
    );
  }
}

function kontrakValues(input: PaketInput) {
  return {
    kontrak_jenis_id: input.kontrak_jenis_id,
    kontrak_no: input.kontrak_no,
    kontrak_nama_paket: input.kontrak_nama_paket,
    kontrak_tanggal: input.kontrak_tanggal,
    kontrak_tanggal_mulai: input.kontrak_tanggal_mulai,
    kontrak_tanggal_selesai: input.kontrak_tanggal_selesai,
    kontrak_jangka_waktu: input.kontrak_jangka_waktu,
    kontrak_hps: input.kontrak_hps,
    kontrak_nilai: input.kontrak_nilai,
    kontrak_ppk: input.ppk,
    kontrak_pptk: input.pptk,
    kontrak_lembaga: input.kontrak_lembaga,
    kontrak_penyedia: input.kontrak_penyedia,
    kontrak_pengawas: input.kontrak_pengawas,
    kontrak_keterangan: input.kontrak_keterangan,
    kontrak_provinsi_id: input.kontrak_provinsi_id,
    kontrak_kab_kota_id: input.kontrak_kab_kota_id,
    kontrak_desa_kelurahan_id: input.kontrak_desa_kelurahan_id,
    // Set cadangan ber-FK: disalin agar tetap sinkron; desa dibiarkan NULL
    // karena FK kolom tersebut salah menunjuk ke kecamatan_distrik_id.
    kontrak_provinsi: input.kontrak_provinsi_id,
    kontrak_kab_kota: input.kontrak_kab_kota_id,
    kontrak_desa_kelurahan: null,
  };
}

export async function createRfk(
  input: PaketInput & { bidang_id: number; user_id: number },
) {
  if (!input.bidang_id) {
    throw new Error("Bidang wajib diisi.");
  }
  const bidang = await getBidang(input.bidang_id);
  if (!bidang) {
    throw new Error("Bidang tidak valid.");
  }
  await validateLokasi(input);
  const actor = input.user_id;

  const kontrak = await getDb()
    .insertInto("kontrak_perjanjian")
    .values({ ...kontrakValues(input), ...auditCreate(actor) })
    .executeTakeFirstOrThrow();
  const kontrakId = Number(kontrak.insertId);

  const row = await getDb()
    .insertInto("transaksi_rfk")
    .values({
      bidang_id: input.bidang_id,
      user_id: input.user_id,
      kontrak_id: kontrakId,
      jenis_belanja_id: input.jenis_belanja_id,
      sumber_dana_id: input.sumber_dana_id,
      metode_pbj_id: input.metode_pbj_id,
      program_kegiatan_id: input.program_kegiatan_id,
      ppk: input.ppk,
      pptk: input.pptk,
      progress_fisik: 0,
      progress_keuangan: 0,
      nilai_realisasi_keuangan: null,
      verval_status: "Draft",
      catatan: input.catatan,
      pengujian_kuantitas: null,
      pengujian_kualitas: null,
      pemberian_kesempatan: null,
      jumlah_hari_keterlambatan: null,
      keterangan: null,
      ...auditCreate(actor),
    })
    .executeTakeFirstOrThrow();
  return Number(row.insertId);
}

export async function updateRfk(id: number, input: PaketInput, actor?: Actor) {
  const row = await getRfk(id);
  if (!row || row.verval_status !== "Draft") {
    throw new Error("Hanya data berstatus Draft yang boleh diubah.");
  }
  await validateLokasi(input);

  await getDb()
    .updateTable("kontrak_perjanjian")
    .set({ ...kontrakValues(input), ...auditEdit(actor) })
    .where("id", "=", row.kontrak_id)
    .execute();

  await getDb()
    .updateTable("transaksi_rfk")
    .set({
      jenis_belanja_id: input.jenis_belanja_id,
      sumber_dana_id: input.sumber_dana_id,
      metode_pbj_id: input.metode_pbj_id,
      program_kegiatan_id: input.program_kegiatan_id,
      ppk: input.ppk,
      pptk: input.pptk,
      catatan: input.catatan,
      ...auditEdit(actor),
    })
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .execute();
}

export async function addenda(transaksiId: number) {
  const trx = await getRfk(transaksiId);
  if (!trx) return [];
  return getDb()
    .selectFrom("addendum")
    .selectAll()
    .where("kontrak_id", "=", trx.kontrak_id)
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("id")
    .execute();
}

export async function pembayaran(transaksiId: number) {
  return getDb()
    .selectFrom("pembayaran")
    .selectAll()
    .where("transaksi_id", "=", transaksiId)
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("termin")
    .execute();
}

export async function stsList(transaksiId: number) {
  return getDb()
    .selectFrom("sts")
    .selectAll()
    .where("transaksi_rfk_id", "=", transaksiId)
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("id")
    .execute();
}

export async function progressList(transaksiId: number) {
  return getDb()
    .selectFrom("progress_fisik")
    .selectAll()
    .where("transaksi_id", "=", transaksiId)
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("id")
    .execute();
}

/** PHO/BAST melekat pada kontrak; dicari lewat transaksi agar pemanggil tetap sederhana. */
export async function phoList(transaksiId: number) {
  const trx = await getRfk(transaksiId);
  if (!trx) return [];
  return phoListByKontrak(trx.kontrak_id);
}

export async function phoListByKontrak(kontrakId: number) {
  return getDb()
    .selectFrom("pho_bast")
    .selectAll()
    .where("kontrak_id", "=", kontrakId)
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("id")
    .execute();
}

export async function evidenceList(transaksiId: number) {
  return getDb()
    .selectFrom("evidence")
    .selectAll()
    .where("transaksi_id", "=", transaksiId)
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("id")
    .execute();
}

export async function addAddendum(
  input: {
    transaksi_id: number;
    nomor_addenddum: string;
    tanggal_addenddum: string;
    addendum_ke?: number | null;
    tanggal_selesai_baru?: string | null;
    nilai_baru: string;
    uraian_addenddum: string | null;
  },
  actor?: Actor,
) {
  await assertDraft(input.transaksi_id);
  const trx = await getRfk(input.transaksi_id);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  await getDb()
    .insertInto("addendum")
    .values({
      kontrak_id: trx.kontrak_id,
      nomor_addenddum: input.nomor_addenddum,
      tanggal_addenddum: input.tanggal_addenddum,
      addendum_ke: input.addendum_ke ?? null,
      tanggal_selesai_baru: input.tanggal_selesai_baru ?? null,
      nilai_baru: input.nilai_baru,
      uraian_addenddum: input.uraian_addenddum,
      ...auditCreate(actor),
    })
    .execute();
  await refreshKeuangan(input.transaksi_id, actor);
}

export async function addPembayaran(
  input: {
    transaksi_id: number;
    termin: number;
    tanggal: string;
    nilai: string;
    uraian: string | null;
  },
  actor?: Actor,
) {
  await assertDraft(input.transaksi_id);
  const trx = await getRfk(input.transaksi_id);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  const kontrak = await getKontrak(trx.kontrak_id);
  if (!kontrak) throw new Error("Kontrak tidak ditemukan.");
  const ads = await addenda(input.transaksi_id);
  const cap = nilaiBerlaku(kontrak.kontrak_nilai, ads);
  const existing = await pembayaran(input.transaksi_id);
  const soFar = existing.reduce((s, p) => s + Number(p.nilai), 0);
  if (soFar + Number(input.nilai) > cap + 0.5) {
    throw new Error("Jumlah pembayaran melebihi nilai kontrak/addendum.");
  }
  await getDb()
    .insertInto("pembayaran")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
  await refreshKeuangan(input.transaksi_id, actor);
}

export async function addSts(
  input: {
    transaksi_rfk_id: number;
    tanggal: string;
    nilai_kelebihan_bayar_atau_denda: string;
    nomor_sts: string;
    uraian: string | null;
  },
  actor?: Actor,
) {
  await assertDraft(input.transaksi_rfk_id);
  const trx = await getRfk(input.transaksi_rfk_id);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  const kontrak = await getKontrak(trx.kontrak_id);
  if (!kontrak?.kontrak_tanggal_selesai) {
    throw new Error("Tanggal selesai kontrak belum diisi.");
  }
  const pho = await phoListByKontrak(trx.kontrak_id);
  if (!terlambat(String(kontrak.kontrak_tanggal_selesai), pho)) {
    throw new Error(
      "STS/denda hanya untuk paket yang terlambat dan belum PHO/BAST.",
    );
  }
  await getDb()
    .insertInto("sts")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}

export async function addProgress(
  input: {
    transaksi_id: number;
    tanggal: string;
    persen: string;
    uraian: string | null;
  },
  actor?: Actor,
) {
  await assertDraft(input.transaksi_id);
  const p = Number(input.persen);
  if (p < 0 || p > 100) throw new Error("Persentase fisik harus 0–100.");
  await getDb()
    .insertInto("progress_fisik")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
  // Kolom ringkasan di transaksi_rfk adalah cache dari riwayat.
  await getDb()
    .updateTable("transaksi_rfk")
    .set({ progress_fisik: p, ...auditEdit(actor) })
    .where("id", "=", input.transaksi_id)
    .execute();
}

export async function addPho(
  input: {
    transaksi_id: number;
    jenis: "PHO" | "BAST";
    tanggal: string;
    nomor: string;
  },
  actor?: Actor,
) {
  await assertDraft(input.transaksi_id);
  const trx = await getRfk(input.transaksi_id);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  await getDb()
    .insertInto("pho_bast")
    .values({
      kontrak_id: trx.kontrak_id,
      jenis: input.jenis,
      tanggal: input.tanggal,
      nomor: input.nomor,
      ...auditCreate(actor),
    })
    .execute();
}

export async function addEvidence(
  input: {
    transaksi_id: number;
    jenis: "kontrak" | "bast" | "foto" | "video";
    stored_name: string;
    original_name: string;
  },
  actor?: Actor,
) {
  await getDb()
    .insertInto("evidence")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}

export async function setStatus(id: number, status: VervalStatus, actor?: Actor) {
  await getDb()
    .updateTable("transaksi_rfk")
    .set({ verval_status: status, ...auditEdit(actor) })
    .where("id", "=", id)
    .where("is_deleted", "=", IS_DELETED.no)
    .execute();
}

export async function userIsSekretariat(user: AuthUser): Promise<boolean> {
  if (!user.bidang_id) return false;
  if (user.role !== "staf" && user.role !== "kepala_bidang") return false;
  const bidang = await getBidang(user.bidang_id);
  return Boolean(bidang && isSekretariat(bidang.bidang_name));
}

export async function canAccess(
  user: AuthUser,
  trx: { bidang_id: number },
): Promise<boolean> {
  if (user.role === "administrator") return true;
  const bidang = await getBidang(trx.bidang_id);
  if (!bidang) return false;
  const opdId = bidang.id_opd;
  if (user.role === "pimpinan") return user.opd_id === opdId;
  if (await userIsSekretariat(user)) return user.opd_id === opdId;
  return user.bidang_id === trx.bidang_id;
}

async function assertDraft(id: number) {
  const row = await getRfk(id);
  if (!row) throw new Error("Transaksi tidak ditemukan.");
  if (row.verval_status !== "Draft") {
    throw new Error("Perubahan hanya diizinkan pada status Draft.");
  }
}

/** Sinkronkan cache progress_keuangan & nilai_realisasi_keuangan dari riwayat pembayaran. */
async function refreshKeuangan(transaksiId: number, actor?: Actor) {
  const trx = await getRfk(transaksiId);
  if (!trx) return;
  const kontrak = await getKontrak(trx.kontrak_id);
  if (!kontrak) return;
  const [ads, byr] = await Promise.all([addenda(transaksiId), pembayaran(transaksiId)]);
  const cap = nilaiBerlaku(kontrak.kontrak_nilai, ads);
  const realisasi = byr.reduce((s, p) => s + Number(p.nilai), 0);
  await getDb()
    .updateTable("transaksi_rfk")
    .set({
      progress_keuangan: persenKeuangan(cap, byr),
      nilai_realisasi_keuangan: realisasi,
      ...auditEdit(actor),
    })
    .where("id", "=", transaksiId)
    .execute();
}
