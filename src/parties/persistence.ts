import { getDb } from "../kernel/index.js";
import { IS_DELETED, auditCreate } from "../kernel/soft-delete.js";

type Actor = number | null | undefined;

export async function listPenyedia() {
  return getDb()
    .selectFrom("penyedia")
    .selectAll()
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("nama")
    .execute();
}

export async function createPenyedia(
  input: {
    nama: string;
    npwp: string | null;
    alamat: string | null;
  },
  actor?: Actor,
) {
  await getDb()
    .insertInto("penyedia")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}

export async function listLembaga() {
  return getDb()
    .selectFrom("lembaga")
    .selectAll()
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("nama")
    .execute();
}

export async function createLembaga(
  input: {
    nama: string;
    alamat: string | null;
  },
  actor?: Actor,
) {
  await getDb()
    .insertInto("lembaga")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}

export async function listKonsultan() {
  return getDb()
    .selectFrom("konsultan")
    .selectAll()
    .where("is_deleted", "=", IS_DELETED.no)
    .orderBy("nama_konsultan")
    .execute();
}

export async function createKonsultan(
  input: {
    nama_konsultan: string;
    jenis_konsultan: "pengawas" | "mk";
  },
  actor?: Actor,
) {
  await getDb()
    .insertInto("konsultan")
    .values({ ...input, ...auditCreate(actor) })
    .execute();
}
