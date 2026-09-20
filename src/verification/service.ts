import { getDb } from "../kernel/index.js";
import { IS_DELETED, auditCreate } from "../kernel/soft-delete.js";
import type { AuthUser } from "../kernel/index.js";
import type { Role, VervalStatus } from "../kernel/tables.js";
import { canAccess, getRfk, setStatus, userIsSekretariat } from "../rfk/index.js";

const next: Record<Role, { from: VervalStatus; to: VervalStatus } | null> = {
  administrator: null,
  staf: { from: "Draft", to: "VerifiedByStaf" },
  kepala_bidang: { from: "VerifiedByStaf", to: "ValidatedByKepalaBidang" },
  pimpinan: {
    from: "ConsolidatedBySekretariat",
    to: "ApprovedByPimpinan",
  },
};

export function nextAction(role: Role) {
  return next[role];
}

type PendingRow = {
  id: number;
  nomor_kontrak: string;
  nama_paket: string;
  verval_status: VervalStatus;
  opd_nama: string;
  bidang_nama: string | null;
};

function pendingQuery() {
  return getDb()
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
      "kontrak_perjanjian.kontrak_no as nomor_kontrak",
      "kontrak_perjanjian.kontrak_nama_paket as nama_paket",
      "transaksi_rfk.verval_status",
      "opd.opd_name as opd_nama",
      "bidang.bidang_name as bidang_nama",
    ])
    .where("transaksi_rfk.is_deleted", "=", IS_DELETED.no)
    .where("opd.is_deleted", "=", IS_DELETED.no)
    .orderBy("transaksi_rfk.id", "desc");
}

export async function pendingFor(user: AuthUser): Promise<PendingRow[]> {
  const rows: PendingRow[] = [];
  const step = next[user.role];

  if (step && user.role !== "pimpinan") {
    let q = pendingQuery().where(
      "transaksi_rfk.verval_status",
      "=",
      step.from,
    );
    if (user.bidang_id) {
      q = q.where("transaksi_rfk.bidang_id", "=", user.bidang_id);
    } else {
      q = q.where("bidang.id_opd", "=", user.opd_id);
    }
    rows.push(...(await q.execute()));
  }

  if (user.role === "pimpinan") {
    const q = pendingQuery()
      .where("transaksi_rfk.verval_status", "=", "ConsolidatedBySekretariat")
      .where("bidang.id_opd", "=", user.opd_id);
    rows.push(...(await q.execute()));
  }

  if (await userIsSekretariat(user)) {
    const q = pendingQuery()
      .where("transaksi_rfk.verval_status", "=", "ValidatedByKepalaBidang")
      .where("bidang.id_opd", "=", user.opd_id);
    for (const row of await q.execute()) {
      if (!rows.some((r) => r.id === row.id)) rows.push(row);
    }
  }

  return rows;
}

export async function advance(
  user: AuthUser,
  transaksiId: number,
  catatan: string | null,
) {
  const trx = await getRfk(transaksiId);
  if (!trx) throw new Error("Transaksi tidak ditemukan.");
  if (!(await canAccess(user, trx))) {
    throw new Error("Data di luar lingkup Anda.");
  }

  if (
    (await userIsSekretariat(user)) &&
    trx.verval_status === "ValidatedByKepalaBidang"
  ) {
    await getDb()
      .insertInto("verval")
      .values({
        transaksi_rfk_id: transaksiId,
        from_status: "ValidatedByKepalaBidang",
        to_status: "ConsolidatedBySekretariat",
        user_id: user.id,
        catatan,
        ...auditCreate(user.id),
      })
      .execute();
    await setStatus(transaksiId, "ConsolidatedBySekretariat", user.id);
    return;
  }

  const step = next[user.role];
  if (!step) throw new Error("Peran ini tidak melakukan verval.");
  if (trx.verval_status !== step.from) {
    throw new Error("Status tidak sesuai tahap verval Anda.");
  }
  await getDb()
    .insertInto("verval")
    .values({
      transaksi_rfk_id: transaksiId,
      from_status: step.from,
      to_status: step.to,
      user_id: user.id,
      catatan,
      ...auditCreate(user.id),
    })
    .execute();
  await setStatus(transaksiId, step.to, user.id);
}

export async function history(transaksiId: number) {
  return getDb()
    .selectFrom("verval")
    .innerJoin("users", "users.id", "verval.user_id")
    .select([
      "verval.id",
      "verval.from_status",
      "verval.to_status",
      "verval.catatan",
      "verval.created_at",
      "users.nama_lengkap as petugas",
    ])
    .where("verval.transaksi_rfk_id", "=", transaksiId)
    .where("verval.is_deleted", "=", IS_DELETED.no)
    .orderBy("verval.id")
    .execute();
}
