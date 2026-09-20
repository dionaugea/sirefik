import { Hono } from "hono";
import {
  currentUser,
  escapeHtml,
  money,
  page,
  requireUser,
} from "../kernel/index.js";
import { getDb } from "../kernel/db.js";
import { IS_DELETED } from "../kernel/soft-delete.js";
import { listJenisKontrak } from "../catalog/index.js";

export const kontrakRoutes = new Hono();
kontrakRoutes.use("/kontrak", requireUser);
kontrakRoutes.use("/kontrak/*", requireUser);

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

kontrakRoutes.get("/kontrak", async (c) => {
  const user = currentUser(c);
  const [rows, jenis] = await Promise.all([
    getDb()
      .selectFrom("kontrak_perjanjian")
      .selectAll()
      .where("is_deleted", "=", IS_DELETED.no)
      .orderBy("id", "desc")
      .execute(),
    listJenisKontrak(),
  ]);
  const jenisNama = (id: number) =>
    jenis.find((j) => j.id === id)?.jenis_kontrak ?? "—";

  return c.html(
    page({
      title: "Data Kontrak",
      user,
      path: "/kontrak",
      body: `<h1>Data Kontrak</h1>
      <p class="lead">Daftar kontrak/SPK perjanjian.</p>
      <table>
        <thead><tr><th>No</th><th>Nomor</th><th>Paket</th><th>Jenis</th><th>Tanggal</th><th>Nilai</th><th></th></tr></thead>
        <tbody>${
          rows
            .map(
              (r, i) => `<tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.kontrak_no)}</td>
              <td>${escapeHtml(r.kontrak_nama_paket)}</td>
              <td>${escapeHtml(jenisNama(r.kontrak_jenis_id))}</td>
              <td>${escapeHtml(isoDate(r.kontrak_tanggal))}</td>
              <td>${money(r.kontrak_nilai ?? 0)}</td>
              <td><a href="/rfk">Lihat RFK</a></td>
            </tr>`,
            )
            .join("") || `<tr><td colspan="7">Belum ada data kontrak.</td></tr>`
        }</tbody>
      </table>`,
    }),
  );
});

kontrakRoutes.get("/kontrak/addendum", async (c) => {
  const user = currentUser(c);
  const rows = await getDb()
    .selectFrom("addendum")
    .innerJoin(
      "kontrak_perjanjian",
      "kontrak_perjanjian.id",
      "addendum.kontrak_id",
    )
    .select([
      "addendum.id",
      "addendum.nomor_addenddum",
      "addendum.tanggal_addenddum",
      "addendum.nilai_baru",
      "addendum.uraian_addenddum",
      "kontrak_perjanjian.kontrak_no",
      "kontrak_perjanjian.kontrak_nama_paket",
    ])
    .where("addendum.is_deleted", "=", IS_DELETED.no)
    .orderBy("addendum.id", "desc")
    .execute();

  return c.html(
    page({
      title: "Data Addendum",
      user,
      path: c.req.path,
      body: `<h1>Data Addendum</h1>
      <p class="lead">Daftar addendum kontrak perjanjian.</p>
      <table>
        <thead><tr><th>Nomor</th><th>Tanggal</th><th>Kontrak</th><th>Paket</th><th>Nilai baru</th><th>Uraian</th></tr></thead>
        <tbody>${
          rows
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.nomor_addenddum)}</td>
              <td>${escapeHtml(isoDate(r.tanggal_addenddum))}</td>
              <td>${escapeHtml(r.kontrak_no)}</td>
              <td>${escapeHtml(r.kontrak_nama_paket)}</td>
              <td>${money(r.nilai_baru ?? 0)}</td>
              <td>${escapeHtml(r.uraian_addenddum ?? "")}</td>
            </tr>`,
            )
            .join("") || `<tr><td colspan="6">Belum ada data addendum.</td></tr>`
        }</tbody>
      </table>`,
    }),
  );
});

kontrakRoutes.get("/kontrak/pho-bast", async (c) => {
  const user = currentUser(c);
  // PHO/BAST melekat pada kontrak; transaksi RFK dicari lewat kontrak_id.
  const rows = await getDb()
    .selectFrom("pho_bast")
    .innerJoin(
      "kontrak_perjanjian",
      "kontrak_perjanjian.id",
      "pho_bast.kontrak_id",
    )
    .leftJoin("transaksi_rfk", (join) =>
      join
        .onRef("transaksi_rfk.kontrak_id", "=", "kontrak_perjanjian.id")
        .on("transaksi_rfk.is_deleted", "=", IS_DELETED.no),
    )
    .select([
      "pho_bast.id",
      "pho_bast.jenis",
      "pho_bast.tanggal",
      "pho_bast.nomor",
      "kontrak_perjanjian.kontrak_no",
      "kontrak_perjanjian.kontrak_nama_paket",
      "transaksi_rfk.id as transaksi_id",
    ])
    .where("pho_bast.is_deleted", "=", IS_DELETED.no)
    .orderBy("pho_bast.id", "desc")
    .execute();

  return c.html(
    page({
      title: "Data PHO/BAST",
      user,
      path: c.req.path,
      body: `<h1>Data PHO/BAST</h1>
      <p class="lead">Daftar berita acara PHO dan BAST.</p>
      <table>
        <thead><tr><th>Jenis</th><th>Nomor</th><th>Tanggal</th><th>Kontrak</th><th>Paket</th><th></th></tr></thead>
        <tbody>${
          rows
            .map(
              (r) => `<tr>
              <td>${escapeHtml(r.jenis)}</td>
              <td>${escapeHtml(r.nomor)}</td>
              <td>${escapeHtml(isoDate(r.tanggal))}</td>
              <td>${escapeHtml(r.kontrak_no)}</td>
              <td>${escapeHtml(r.kontrak_nama_paket)}</td>
              <td>${r.transaksi_id ? `<a href="/rfk/${r.transaksi_id}">Buka RFK</a>` : "—"}</td>
            </tr>`,
            )
            .join("") || `<tr><td colspan="6">Belum ada data PHO/BAST.</td></tr>`
        }</tbody>
      </table>`,
    }),
  );
});

kontrakRoutes.get("/kontrak/pembayaran", async (c) => {
  const user = currentUser(c);
  const rows = await getDb()
    .selectFrom("pembayaran")
    .innerJoin("transaksi_rfk", "transaksi_rfk.id", "pembayaran.transaksi_id")
    .innerJoin(
      "kontrak_perjanjian",
      "kontrak_perjanjian.id",
      "transaksi_rfk.kontrak_id",
    )
    .select([
      "pembayaran.id",
      "pembayaran.termin",
      "pembayaran.tanggal",
      "pembayaran.nilai",
      "pembayaran.uraian",
      "kontrak_perjanjian.kontrak_no",
      "kontrak_perjanjian.kontrak_nama_paket",
      "transaksi_rfk.id as transaksi_id",
    ])
    .where("pembayaran.is_deleted", "=", IS_DELETED.no)
    .where("transaksi_rfk.is_deleted", "=", IS_DELETED.no)
    .orderBy("pembayaran.id", "desc")
    .execute();

  return c.html(
    page({
      title: "Data Pembayaran",
      user,
      path: c.req.path,
      body: `<h1>Data Pembayaran</h1>
      <p class="lead">Daftar termin pembayaran kontrak.</p>
      <table>
        <thead><tr><th>Termin</th><th>Tanggal</th><th>Nilai</th><th>Kontrak</th><th>Paket</th><th>Uraian</th><th></th></tr></thead>
        <tbody>${
          rows
            .map(
              (r) => `<tr>
              <td>${r.termin}</td>
              <td>${escapeHtml(isoDate(r.tanggal))}</td>
              <td>${money(r.nilai)}</td>
              <td>${escapeHtml(r.kontrak_no)}</td>
              <td>${escapeHtml(r.kontrak_nama_paket)}</td>
              <td>${escapeHtml(r.uraian ?? "")}</td>
              <td><a href="/rfk/${r.transaksi_id}">Buka RFK</a></td>
            </tr>`,
            )
            .join("") || `<tr><td colspan="7">Belum ada data pembayaran.</td></tr>`
        }</tbody>
      </table>`,
    }),
  );
});
