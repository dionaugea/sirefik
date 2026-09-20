import type { Generated } from "kysely";
import type { AuditColumns, LegacySoftDeleteColumns } from "./soft-delete.js";

export type Role =
  | "administrator"
  | "staf"
  | "kepala_bidang"
  | "pimpinan";

export type VervalStatus =
  | "Draft"
  | "VerifiedByStaf"
  | "ValidatedByKepalaBidang"
  | "ConsolidatedBySekretariat"
  | "ApprovedByPimpinan";

/** Master wilayah — hanya-baca, tanpa kolom audit. */
export interface ProvinsiTable {
  provinsi_id: number;
  provinsi_name: string;
}

export interface KabKotaProvinsiTable {
  kab_kota_provinsi_id: number;
  provinsi_id: number;
  kab_kota_provinsi_nama: string;
}

export interface KecamatanDistrikTable {
  kecamatan_distrik_id: number;
  kab_kota_provinsi_id: number;
  kecamatan_distrik_name: string;
}

export interface DesaKelurahanTable {
  desa_kelurahan_id: number;
  kecamatan_distrik_id: number;
  desa_kelurahan_name: string;
}

export interface GeoMasterTables {
  provinsi: ProvinsiTable;
  kab_kota_provinsi: KabKotaProvinsiTable;
  kecamatan_distrik: KecamatanDistrikTable;
  desa_kelurahan: DesaKelurahanTable;
}

export interface EntitasTable extends AuditColumns {
  id: Generated<number>;
  id_provinsi: number;
  entitas_name: string;
  alamat: string | null;
  tahun_berdiri: number | null;
  file_logo_entitas: string | null;
}

export interface OpdTable extends AuditColumns {
  id: Generated<number>;
  id_entitas: number;
  opd_name: string;
  tugas_fungsi: string | null;
  alamat_kantor: string | null;
  no_telp: string | null;
  email: string | null;
}

export interface BidangTable extends AuditColumns {
  id: Generated<number>;
  id_opd: number;
  bidang_name: string;
  bidang_fungsi: string;
}

/** Ada di DB namun tidak dirujuk FK mana pun; PPK/PPTK diambil dari `users`. */
export interface PpkPptkTable extends AuditColumns {
  id: Generated<number>;
  opd_id: number;
  nama: string;
  nip: string;
  jabatan: "PPK" | "PPTK";
}

export interface OrganizationTables {
  entitas: EntitasTable;
  opd: OpdTable;
  bidang: BidangTable;
  ppk_pptk: PpkPptkTable;
}

export interface UserTable extends AuditColumns {
  id: Generated<number>;
  bidang_id: number;
  nama_lengkap: string;
  username: string;
  password_hash: string;
  role: Role;
  nip: string | null;
  jabatan: string | null;
  no_telp: string | null;
  email: string | null;
  date_registered: Generated<string | null>;
}

export interface IdentityTables {
  users: UserTable;
}

export interface AppSetupTable extends AuditColumns {
  id: Generated<number>;
  user_id: number;
  entitas_id: number;
  terms_accepted: Generated<number>;
  accepted_at: string | null;
}

export interface SetupTables {
  app_setup: AppSetupTable;
}

export interface JenisBelanjaTable extends LegacySoftDeleteColumns {
  id: Generated<number>;
  parent_id: number | null;
  level: number;
  kode: string;
  nama: string;
}

export interface SumberDanaTable extends LegacySoftDeleteColumns {
  id: Generated<number>;
  kode: string;
  nama: string;
}

export interface MetodePbjTable extends LegacySoftDeleteColumns {
  id: Generated<number>;
  kode: string;
  metode_pbj_name: string;
}

export interface JenisKontrakTable extends LegacySoftDeleteColumns {
  id: Generated<number>;
  kode: string;
  jenis_kontrak: string;
}

export interface ProgramKegiatanTable extends AuditColumns {
  id: Generated<number>;
  bidang_id: number;
  kode_program_kegiatan: string;
  program: string;
  kegiatan: string;
  pagu_anggaran: number | null;
}

export interface CatalogTables {
  jenis_belanja: JenisBelanjaTable;
  sumber_dana: SumberDanaTable;
  metode_pbj: MetodePbjTable;
  jenis_kontrak: JenisKontrakTable;
  program_kegiatan: ProgramKegiatanTable;
}

export interface PenyediaTable extends AuditColumns {
  id: Generated<number>;
  nama: string;
  npwp: string | null;
  alamat: string | null;
}

export interface LembagaTable extends AuditColumns {
  id: Generated<number>;
  nama: string;
  alamat: string | null;
}

export interface KonsultanTable extends AuditColumns {
  id: Generated<number>;
  nama_konsultan: string;
  jenis_konsultan: "pengawas" | "mk";
}

export interface PartiesTables {
  penyedia: PenyediaTable;
  lembaga: LembagaTable;
  konsultan: KonsultanTable;
}

export interface KontrakPerjanjianTable extends AuditColumns {
  id: Generated<number>;
  kontrak_jenis_id: number;
  kontrak_no: string;
  kontrak_nama_paket: string;
  kontrak_tanggal: string | null;
  kontrak_tanggal_mulai: string | null;
  kontrak_tanggal_selesai: string | null;
  kontrak_jangka_waktu: number | null;
  kontrak_hps: number | null;
  kontrak_nilai: number | null;
  /** FK → users.id */
  kontrak_ppk: number | null;
  /** FK → users.id */
  kontrak_pptk: number | null;
  kontrak_lembaga: number | null;
  kontrak_penyedia: number | null;
  kontrak_pengawas: number | null;
  kontrak_keterangan: string | null;
  /** Set lokasi wajib (sumber kebenaran). */
  kontrak_provinsi_id: number;
  kontrak_kab_kota_id: number;
  kontrak_desa_kelurahan_id: number;
  /** Set lokasi cadangan (ber-FK); disalin dari set wajib, desa dibiarkan NULL. */
  kontrak_provinsi: number | null;
  kontrak_kab_kota: number | null;
  kontrak_desa_kelurahan: number | null;
}

export interface TransaksiRfkTable extends AuditColumns {
  id: Generated<number>;
  bidang_id: number;
  user_id: number;
  kontrak_id: number;
  jenis_belanja_id: number;
  sumber_dana_id: number;
  metode_pbj_id: number;
  /** FK → users.id */
  ppk: number;
  /** FK → users.id */
  pptk: number;
  program_kegiatan_id: number | null;
  progress_fisik: number;
  progress_keuangan: number;
  nilai_realisasi_keuangan: number | null;
  verval_status: Generated<VervalStatus>;
  catatan: string | null;
  pengujian_kuantitas: string | null;
  pengujian_kualitas: string | null;
  pemberian_kesempatan: number | null;
  jumlah_hari_keterlambatan: number | null;
  keterangan: string | null;
}

export interface AddendumTable extends AuditColumns {
  id: Generated<number>;
  kontrak_id: number;
  nomor_addenddum: string;
  tanggal_addenddum: string;
  addendum_ke: number | null;
  tanggal_selesai_baru: string | null;
  nilai_baru: string | null;
  uraian_addenddum: string | null;
}

export interface PembayaranTable extends AuditColumns {
  id: Generated<number>;
  transaksi_id: number;
  termin: number;
  tanggal: string;
  nilai: string;
  uraian: string | null;
}

export interface StsTable extends AuditColumns {
  id: Generated<number>;
  transaksi_rfk_id: number;
  tanggal: string;
  nilai_kelebihan_bayar_atau_denda: string;
  nomor_sts: string;
  uraian: string | null;
}

export interface ProgressFisikTable extends AuditColumns {
  id: Generated<number>;
  transaksi_id: number;
  tanggal: string;
  persen: string;
  uraian: string | null;
}

export interface PhoBastTable extends AuditColumns {
  id: Generated<number>;
  kontrak_id: number;
  jenis: "PHO" | "BAST";
  tanggal: string;
  nomor: string;
}

export interface EvidenceTable extends AuditColumns {
  id: Generated<number>;
  transaksi_id: number;
  jenis: "kontrak" | "bast" | "foto" | "video";
  stored_name: string;
  original_name: string;
}

export interface RfkTables {
  kontrak_perjanjian: KontrakPerjanjianTable;
  transaksi_rfk: TransaksiRfkTable;
  addendum: AddendumTable;
  pembayaran: PembayaranTable;
  sts: StsTable;
  progress_fisik: ProgressFisikTable;
  pho_bast: PhoBastTable;
  evidence: EvidenceTable;
}

export interface VervalTable extends AuditColumns {
  id: Generated<number>;
  transaksi_rfk_id: number;
  from_status: VervalStatus;
  to_status: VervalStatus;
  user_id: number;
  catatan: string | null;
}

export interface VerificationTables {
  verval: VervalTable;
}

export interface Database
  extends OrganizationTables,
    IdentityTables,
    CatalogTables,
    PartiesTables,
    RfkTables,
    VerificationTables,
    SetupTables,
    GeoMasterTables {}
