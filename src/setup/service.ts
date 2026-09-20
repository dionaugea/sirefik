import { sql } from "kysely";
import { getDb } from "../kernel/index.js";
import { IS_DELETED, auditCreate, auditEdit } from "../kernel/soft-delete.js";
import type { Role } from "../kernel/tables.js";
import {
  countBidang,
  createBidang,
  createOpd,
  getEntitas,
  getKabKota,
  getProvinsi,
  listBidang,
  listOpd,
  updateOpd,
  upsertEntitas,
} from "../organization/index.js";
import {
  countUsers,
  createUser,
  getUserById,
  updateUser,
} from "../identity/index.js";
import { assertNip } from "./provinces.js";

export type RegistrationPhase =
  | "entitas"
  | "opd"
  | "bidang"
  | "pengguna"
  | "ketentuan";

const REQUIRED_ROLES: Role[] = ["administrator"];

export async function isSetupComplete(): Promise<boolean> {
  const row = await getDb()
    .selectFrom("app_setup")
    .select("id")
    .where("is_deleted", "=", IS_DELETED.no)
    .where("terms_accepted", "=", 1)
    .executeTakeFirst();
  return Boolean(row);
}

export async function countOpd(): Promise<number> {
  const row = await getDb()
    .selectFrom("opd")
    .select(getDb().fn.countAll<number>().as("n"))
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

export async function registeredRoles(): Promise<Role[]> {
  const rows = await getDb()
    .selectFrom("users")
    .select("role")
    .where("is_deleted", "=", IS_DELETED.no)
    .execute();
  return [...new Set(rows.map((r) => r.role))];
}

export async function missingUserRoles(): Promise<Role[]> {
  const have = new Set(await registeredRoles());
  return REQUIRED_ROLES.filter((r) => !have.has(r));
}

export async function currentRegistrationPhase(): Promise<RegistrationPhase> {
  if (!(await getEntitas())) return "entitas";
  if ((await countOpd()) === 0) return "opd";
  if ((await countBidang()) === 0) return "bidang";
  if ((await missingUserRoles()).length > 0) return "pengguna";
  return "ketentuan";
}

export async function phasePath(): Promise<string> {
  return `/daftar/${await currentRegistrationPhase()}`;
}

export async function saveEntitas(input: {
  id_provinsi: number;
  kab_kota_id: number;
  tahun_berdiri: number;
  file_logo_entitas: string | null;
}): Promise<void> {
  const prov = await getProvinsi(input.id_provinsi);
  if (!prov) throw new Error("Provinsi tidak sah.");
  const kab = await getKabKota(input.kab_kota_id);
  if (!kab || kab.provinsi_id !== input.id_provinsi) {
    throw new Error("Kabupaten/kota tidak sah untuk provinsi tersebut.");
  }
  await upsertEntitas({
    id_provinsi: prov.provinsi_id,
    entitas_name: kab.kab_kota_provinsi_nama,
    alamat: null,
    tahun_berdiri: input.tahun_berdiri,
    file_logo_entitas: input.file_logo_entitas,
  });
}

export async function saveOpd(input: {
  nama_opd: string;
  tugas_fungsi: string | null;
  alamat_kantor: string | null;
  no_telp: string | null;
  email: string | null;
}): Promise<void> {
  const entitas = await getEntitas();
  if (!entitas) throw new Error("Entitas belum diisi.");
  const existing = (await listOpd())[0];
  if (existing) {
    await updateOpd(existing.id, {
      opd_name: input.nama_opd,
      tugas_fungsi: input.tugas_fungsi,
      alamat_kantor: input.alamat_kantor,
      no_telp: input.no_telp,
      email: input.email,
    });
    return;
  }
  await createOpd({
    id_entitas: entitas.id,
    opd_name: input.nama_opd,
    tugas_fungsi: input.tugas_fungsi,
    alamat_kantor: input.alamat_kantor,
    no_telp: input.no_telp,
    email: input.email,
  });
}

export async function saveBidang(input: {
  bidang_name: string;
  bidang_fungsi: string;
}): Promise<void> {
  const opd = (await listOpd())[0];
  if (!opd) throw new Error("OPD belum diisi.");
  await createBidang({
    id_opd: opd.id,
    bidang_name: input.bidang_name,
    bidang_fungsi: input.bidang_fungsi,
  });
}

export async function saveUser(input: {
  nama: string;
  nip: string | null;
  jabatan: string | null;
  bidang_id: number;
  no_telp: string | null;
  email: string | null;
  username: string;
  password: string;
  role: Role;
}): Promise<void> {
  if (input.role !== "administrator") {
    throw new Error("Pada registrasi hanya boleh mendaftarkan administrator sistem.");
  }
  const nama = input.nama.trim();
  const username = input.username.trim();
  const nip = (input.nip ?? "").trim();
  assertNip(nip);
  if (!nama || !username || !input.password) {
    throw new Error("Nama, nama pengguna, dan kata sandi wajib diisi.");
  }
  if ((await registeredRoles()).includes("administrator")) {
    throw new Error("Administrator sistem sudah terdaftar.");
  }
  const bidang = (await listBidang()).find((b) => b.id === input.bidang_id);
  if (!bidang) throw new Error("Bidang wajib dipilih.");

  const adminId = await createUser({
    bidang_id: input.bidang_id,
    nama,
    username,
    password: input.password,
    role: "administrator",
    nip,
    jabatan: input.jabatan,
    no_telp: input.no_telp,
    email: input.email,
  });

  // Administrator pertama tercatat sebagai pembuat dirinya dan data registrasi.
  await getDb()
    .updateTable("users")
    .set({ user_created: adminId })
    .where("id", "=", adminId)
    .execute();
  await stampRegistrationCreator(adminId);
}

async function stampRegistrationCreator(adminId: number): Promise<void> {
  for (const table of ["entitas", "opd", "bidang"] as const) {
    await getDb()
      .updateTable(table)
      .set({ user_created: adminId })
      .where("user_created", "is", null)
      .execute();
  }
}

export async function updateRegisteredUser(input: {
  id: number;
  nama: string;
  nip: string | null;
  jabatan: string | null;
  bidang_id: number;
  no_telp: string | null;
  email: string | null;
  username: string;
  password: string;
}): Promise<void> {
  const existing = await getUserById(input.id);
  if (!existing || existing.role !== "administrator") {
    throw new Error("Pada registrasi hanya administrator sistem yang diubah.");
  }
  const nama = input.nama.trim();
  const username = input.username.trim();
  const nip = (input.nip ?? "").trim();
  assertNip(nip);
  if (!nama || !username) throw new Error("Nama dan nama pengguna wajib diisi.");
  await updateUser(
    input.id,
    {
      bidang_id: input.bidang_id,
      nama,
      username,
      password: input.password.trim() || undefined,
      nip,
      jabatan: input.jabatan,
      no_telp: input.no_telp,
      email: input.email,
    },
    input.id,
  );
}

export async function acceptTerms(): Promise<void> {
  if ((await countUsers()) === 0) throw new Error("Pengguna belum diisi.");
  if ((await missingUserRoles()).length > 0) {
    throw new Error("Administrator sistem wajib diisi.");
  }
  if ((await countBidang()) === 0) throw new Error("Bidang wajib diisi.");
  const entitas = await getEntitas();
  const admin = await getDb()
    .selectFrom("users")
    .select("id")
    .where("role", "=", "administrator")
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
  if (!entitas || !admin) throw new Error("Data registrasi belum lengkap.");

  const existing = await getDb()
    .selectFrom("app_setup")
    .select("id")
    .where("is_deleted", "=", IS_DELETED.no)
    .executeTakeFirst();
  if (existing) {
    await getDb()
      .updateTable("app_setup")
      .set({
        terms_accepted: 1,
        accepted_at: sql`CURRENT_TIMESTAMP`,
        user_id: admin.id,
        entitas_id: entitas.id,
        ...auditEdit(admin.id),
      })
      .where("id", "=", existing.id)
      .execute();
    return;
  }
  await getDb()
    .insertInto("app_setup")
    .values({
      user_id: admin.id,
      entitas_id: entitas.id,
      terms_accepted: 1,
      accepted_at: sql`CURRENT_TIMESTAMP`,
      ...auditCreate(admin.id),
    })
    .execute();
}
