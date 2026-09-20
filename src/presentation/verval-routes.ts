import { Hono } from "hono";
import {
  currentUser,
  escapeHtml,
  hasRole,
  page,
  requireUser,
} from "../kernel/index.js";
import { listRfk, getRfk, userIsSekretariat, canAccess } from "../rfk/index.js";
import { advance, nextAction, pendingFor } from "../verification/index.js";

export const vervalRoutes = new Hono();
vervalRoutes.use("/verval", requireUser);
vervalRoutes.use("/verval/*", requireUser);

const statusLabel: Record<string, string> = {
  Draft: "Konsep",
  VerifiedByStaf: "Diverifikasi staf bidang",
  ValidatedByKepalaBidang: "Divalidasi kepala bidang",
  ConsolidatedBySekretariat: "Dikonsolidasi Sekretariat",
  ApprovedByPimpinan: "Disetujui pimpinan",
};

vervalRoutes.get("/verval", async (c) => {
  const user = currentUser(c);
  const rows = await listRfk(user);
  const sekretariat = await userIsSekretariat(user);
  const step = nextAction(user.role);
  const pending = hasRole(user, ["administrator"])
    ? []
    : await pendingFor(user);
  const pendingIds = new Set(pending.map((p) => p.id));

  const lead = hasRole(user, ["administrator"])
    ? "Daftar transaksi RFK untuk pemantauan verifikasi/validasi."
    : sekretariat
      ? `Selain verval bidang sendiri, Sekretariat mengonsolidasi laporan RFK tingkat OPD (${statusLabel.ValidatedByKepalaBidang} → ${statusLabel.ConsolidatedBySekretariat}) untuk persetujuan pimpinan.`
      : step
        ? `Tahap Anda: ${statusLabel[step.from]} → ${statusLabel[step.to]}`
        : "Daftar transaksi RFK terkait verifikasi/validasi.";

  const hasData = rows.length > 0;
  const actionHead = hasData ? "<th>Ubah</th><th>Verval Data</th>" : "";

  return c.html(
    page({
      title: "Verifikasi / Validasi",
      user,
      path: "/verval",
      notice: c.req.query("ok"),
      error: c.req.query("err"),
      body: `<h1>Verifikasi / Validasi</h1>
      <p class="lead">${lead}</p>
      <table>
        <thead><tr><th>No</th><th>Nomor</th><th>Paket</th><th>Bidang</th><th>Status</th>${actionHead}</tr></thead>
        <tbody>${
          rows
            .map((r, i) => {
              const canVerval =
                !hasRole(user, ["administrator"]) && pendingIds.has(r.id);
              return `<tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(r.kontrak_no)}</td>
                <td>${escapeHtml(r.kontrak_nama_paket)}</td>
                <td>${escapeHtml(r.bidang_nama ?? "—")}</td>
                <td>${escapeHtml(statusLabel[r.verval_status] ?? r.verval_status)}</td>
                ${
                  hasData
                    ? `<td><a class="btn ghost" href="/rfk/${r.id}">Ubah</a></td>
                       <td>${
                         canVerval
                           ? `<a class="btn" href="/verval/${r.id}">Verval Data</a>`
                           : `<a class="btn ghost" href="/verval/${r.id}">Verval Data</a>`
                       }</td>`
                    : ""
                }
              </tr>`;
            })
            .join("") ||
          `<tr><td colspan="5">Belum ada data pada transaksi RFK.</td></tr>`
        }</tbody>
      </table>`,
    }),
  );
});

vervalRoutes.get("/verval/:id", async (c) => {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  const trx = await getRfk(id);
  if (!trx || !(await canAccess(user, trx))) {
    return c.redirect(
      `/verval?err=${encodeURIComponent("Akses ditolak atau data tidak ditemukan.")}`,
    );
  }
  const rows = await listRfk(user);
  const row = rows.find((r) => r.id === id);
  if (!row) {
    return c.redirect(
      `/verval?err=${encodeURIComponent("Data tidak ditemukan.")}`,
    );
  }
  const sekretariat = await userIsSekretariat(user);
  const pending = hasRole(user, ["administrator"])
    ? []
    : await pendingFor(user);
  const canAct = pending.some((p) => p.id === id);
  const consolidate =
    sekretariat && row.verval_status === "ValidatedByKepalaBidang";

  return c.html(
    page({
      title: "Verval Data",
      user,
      path: "/verval",
      notice: c.req.query("ok"),
      error: c.req.query("err"),
      body: `<h1>Verval Data</h1>
      <p class="lead">${escapeHtml(row.kontrak_no)} — ${escapeHtml(row.kontrak_nama_paket)}</p>
      <dl class="detail-list">
        <div><dt>Bidang</dt><dd>${escapeHtml(row.bidang_nama ?? "—")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(statusLabel[row.verval_status] ?? row.verval_status)}</dd></div>
      </dl>
      <div class="actions">
        <a class="btn ghost" href="/rfk/${row.id}">Ubah</a>
        <a class="btn ghost" href="/verval">Kembali</a>
      </div>
      ${
        canAct
          ? `<form class="card" method="post" action="/verval/${row.id}" style="margin-top:1rem">
              <label>Catatan</label>
              <input name="catatan" placeholder="Catatan (opsional)">
              <div class="actions"><button>${consolidate ? "Konsolidasi" : "Setujui tahap ini"}</button></div>
            </form>`
          : `<p class="muted" style="margin-top:1rem">Tidak ada aksi verval untuk peran/status saat ini.</p>`
      }`,
    }),
  );
});

vervalRoutes.post("/verval/:id", async (c) => {
  const user = currentUser(c);
  if (hasRole(user, ["administrator"])) {
    return c.redirect(
      `/verval?err=${encodeURIComponent("Administrator tidak memproses verval.")}`,
    );
  }
  try {
    const b = await c.req.parseBody();
    await advance(
      user,
      Number(c.req.param("id")),
      String(b.catatan || "") || null,
    );
    return c.redirect(`/verval?ok=${encodeURIComponent("Verval disimpan.")}`);
  } catch (e) {
    return c.redirect(
      `/verval?err=${encodeURIComponent((e as Error).message)}`,
    );
  }
});
