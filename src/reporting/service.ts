import { getDb } from "../kernel/index.js";
import { IS_DELETED } from "../kernel/soft-delete.js";
import type { AuthUser } from "../kernel/index.js";
import {
  addenda,
  listRfk,
  pembayaran,
  progressList,
  nilaiBerlaku,
  persenFisik,
  persenKeuangan,
  userIsSekretariat,
} from "../rfk/index.js";

async function applyBidangScope(
  q: {
    where: (col: string, op: string, val: number) => unknown;
  },
  user: AuthUser,
) {
  if (user.role === "administrator") return q;
  if (user.role === "pimpinan" || (await userIsSekretariat(user))) {
    return q.where("bidang.id_opd", "=", user.opd_id);
  }
  if (user.bidang_id) {
    return q.where("transaksi_rfk.bidang_id", "=", user.bidang_id);
  }
  return q.where("bidang.id_opd", "=", user.opd_id);
}

export async function dashboard(user: AuthUser) {
  const rows = await listRfk(user);
  const byStatus: Record<string, number> = {};
  let nilai = 0;
  let fisik = 0;
  let keu = 0;
  for (const r of rows) {
    byStatus[r.verval_status] = (byStatus[r.verval_status] ?? 0) + 1;
    const ads = await addenda(r.id);
    const bayar = await pembayaran(r.id);
    const prog = await progressList(r.id);
    const cap = nilaiBerlaku(r.kontrak_nilai, ads);
    nilai += cap;
    fisik += persenFisik(prog);
    keu += persenKeuangan(cap, bayar);
  }
  const n = rows.length || 1;
  return {
    jumlahPaket: rows.length,
    totalNilai: nilai,
    rataFisik: Math.round((fisik / n) * 100) / 100,
    rataKeuangan: Math.round((keu / n) * 100) / 100,
    byStatus,
  };
}

export async function byKelompokBelanja(user: AuthUser) {
  let q = getDb()
    .selectFrom("transaksi_rfk")
    .innerJoin(
      "kontrak_perjanjian",
      "kontrak_perjanjian.id",
      "transaksi_rfk.kontrak_id",
    )
    .innerJoin("bidang", "bidang.id", "transaksi_rfk.bidang_id")
    .leftJoin("jenis_belanja", "jenis_belanja.id", "transaksi_rfk.jenis_belanja_id")
    .select([
      "jenis_belanja.kode as kode",
      "jenis_belanja.nama as nama",
      "jenis_belanja.level as level",
      "transaksi_rfk.id",
      "kontrak_perjanjian.kontrak_nama_paket",
      "kontrak_perjanjian.kontrak_nilai",
      "transaksi_rfk.verval_status",
      "bidang.id_opd as opd_id",
      "transaksi_rfk.bidang_id",
    ])
    .where("transaksi_rfk.is_deleted", "=", IS_DELETED.no);
  q = (await applyBidangScope(q, user)) as typeof q;
  const rows = await q.execute();
  const groups = new Map<
    string,
    { kode: string; nama: string; paket: number; nilai: number }
  >();
  for (const r of rows) {
    const key = r.kode ?? "—";
    const cur = groups.get(key) ?? {
      kode: key,
      nama: r.nama ?? "Tanpa kelompok belanja",
      paket: 0,
      nilai: 0,
    };
    cur.paket += 1;
    cur.nilai += Number(r.kontrak_nilai ?? 0);
    groups.set(key, cur);
  }
  return [...groups.values()];
}

/**
 * Lokasi paket diambil dari kolom wilayah pada kontrak_perjanjian.
 * Master wilayah tidak memiliki lat/lng — dikembalikan nama saja.
 */
export async function petaTitik(user: AuthUser) {
  let q = getDb()
    .selectFrom("transaksi_rfk")
    .innerJoin(
      "kontrak_perjanjian",
      "kontrak_perjanjian.id",
      "transaksi_rfk.kontrak_id",
    )
    .innerJoin("bidang", "bidang.id", "transaksi_rfk.bidang_id")
    .leftJoin("provinsi", "provinsi.provinsi_id", "kontrak_perjanjian.kontrak_provinsi_id")
    .leftJoin(
      "kab_kota_provinsi",
      "kab_kota_provinsi.kab_kota_provinsi_id",
      "kontrak_perjanjian.kontrak_kab_kota_id",
    )
    .leftJoin(
      "desa_kelurahan",
      "desa_kelurahan.desa_kelurahan_id",
      "kontrak_perjanjian.kontrak_desa_kelurahan_id",
    )
    .select([
      "transaksi_rfk.id",
      "kontrak_perjanjian.kontrak_nama_paket as nama_paket",
      "kontrak_perjanjian.kontrak_no as nomor_kontrak",
      "desa_kelurahan.desa_kelurahan_name as lokasi_nama",
      "provinsi.provinsi_name as lokasi_provinsi",
      "kab_kota_provinsi.kab_kota_provinsi_nama as lokasi_kab_kota",
      "desa_kelurahan.desa_kelurahan_name as lokasi_desa_kelurahan",
    ])
    .where("transaksi_rfk.is_deleted", "=", IS_DELETED.no);
  q = (await applyBidangScope(q, user)) as typeof q;
  const rows = await q.execute();
  return rows.map((r) => ({
    ...r,
    lat: null as number | null,
    lng: null as number | null,
  }));
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export async function exportCsv(user: AuthUser): Promise<string> {
  const rows = await listRfk(user);
  const header = [
    "id",
    "opd",
    "bidang",
    "kontrak_no",
    "kontrak_nama_paket",
    "kontrak_nilai",
    "status_verval",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        csvEscape(r.opd_nama),
        csvEscape(r.bidang_nama ?? ""),
        csvEscape(r.kontrak_no),
        csvEscape(r.kontrak_nama_paket),
        r.kontrak_nilai ?? "",
        r.verval_status,
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}`;
}
