import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Hono } from "hono";
import {
  currentUser,
  hasRole,
  money,
  num,
  page,
  requireUser,
  uploadsDir,
} from "../kernel/index.js";
import {
  addAddendum,
  addEvidence,
  addPembayaran,
  addPho,
  addProgress,
  addSts,
  addenda,
  canAccess,
  createRfk,
  evidenceList,
  getKontrak,
  getRfk,
  listRfk,
  pembayaran,
  persenFisik,
  persenKeuangan,
  phoList,
  progressList,
  stsList,
  terlambat,
  updateRfk,
  nilaiBerlaku,
  type PaketInput,
} from "../rfk/index.js";
import { history } from "../verification/index.js";
import {
  listJenisBelanja,
  listJenisKontrak,
  listMetodePbj,
  listProgramKegiatan,
  listSumberDana,
} from "../catalog/index.js";
import { listKonsultan, listLembaga, listPenyedia } from "../parties/index.js";
import {
  getBidang,
  getDesa,
  listDesaByKecamatan,
  listKabKota,
  listKecamatan,
  listProvinsi,
} from "../organization/index.js";
import { listUsers } from "../identity/index.js";

export const rfkRoutes = new Hono();
rfkRoutes.use("/rfk", requireUser);
rfkRoutes.use("/rfk/*", requireUser);
rfkRoutes.use("/api/wilayah/*", requireUser);

/* Dropdown wilayah berjenjang untuk lokasi kontrak. */
rfkRoutes.get("/api/wilayah/kab-kota/:provinsiId", async (c) => {
  const rows = await listKabKota(Number(c.req.param("provinsiId")));
  return c.json(rows.map((r) => ({ id: r.kab_kota_provinsi_id, label: r.kab_kota_provinsi_nama })));
});
rfkRoutes.get("/api/wilayah/kecamatan/:kabKotaId", async (c) => {
  const rows = await listKecamatan(Number(c.req.param("kabKotaId")));
  return c.json(rows.map((r) => ({ id: r.kecamatan_distrik_id, label: r.kecamatan_distrik_name })));
});
rfkRoutes.get("/api/wilayah/desa/:kecamatanId", async (c) => {
  const rows = await listDesaByKecamatan(Number(c.req.param("kecamatanId")));
  return c.json(rows.map((r) => ({ id: r.desa_kelurahan_id, label: r.desa_kelurahan_name })));
});

const statusLabel: Record<string, string> = {
  Draft: "Konsep",
  VerifiedByStaf: "Diverifikasi staf bidang",
  ValidatedByKepalaBidang: "Divalidasi kepala bidang",
  ConsolidatedBySekretariat: "Dikonsolidasi Sekretariat",
  ApprovedByPimpinan: "Disetujui pimpinan",
};

function isoDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function opt(v: unknown): number | null {
  const n = Number(v);
  return v !== undefined && v !== null && String(v) !== "" && Number.isFinite(n)
    ? n
    : null;
}

function reqNum(v: unknown, label: string): number {
  const n = opt(v);
  if (n === null) throw new Error(`${label} wajib diisi.`);
  return n;
}

function options(
  rows: { id: number; label: string }[],
  selected?: number | null,
) {
  return `<option value="">—</option>${rows
    .map(
      (r) =>
        `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${r.label}</option>`,
    )
    .join("")}`;
}

rfkRoutes.get("/rfk", async (c) => {
  const user = currentUser(c);
  const rows = await listRfk(user);
  return c.html(
    page({
      title: "Data RFK",
      user,
      notice: c.req.query("ok"),
      error: c.req.query("err"),
      body: `<h1>Data RFK</h1>
      <p class="lead">Paket pekerjaan tingkat bidang yang sudah memiliki kontrak/SPK.</p>
      ${user.role === "staf" ? `<p class="actions"><a class="btn" href="/rfk/baru">Paket baru</a></p>` : ""}
      <table>
        <thead><tr><th>Nomor</th><th>Paket</th><th>Bidang</th><th>Nilai</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>
              <td>${r.kontrak_no}</td>
              <td>${r.kontrak_nama_paket}</td>
              <td>${r.bidang_nama ?? "—"}</td>
              <td>${money(r.kontrak_nilai ?? 0)}</td>
              <td><span class="badge">${statusLabel[r.verval_status] ?? r.verval_status}</span></td>
              <td><a href="/rfk/${r.id}">Buka</a></td>
            </tr>`,
          )
          .join("")}</tbody>
      </table>`,
    }),
  );
});

type Opt = { id: number; label: string };

/**
 * Lookup form paket. Bila kontrak sudah ada, daftar kab/kota, kecamatan,
 * dan desa diisi untuk lokasi yang tersimpan agar bisa ditampilkan terpilih.
 */
async function formLookups(
  opdId: number,
  bidangId: number,
  lokasi?: { provinsiId: number; kabKotaId: number; desaId: number } | null,
) {
  const [jb, sd, md, jk, peny, lem, kon, users, prog, prov] = await Promise.all([
    listJenisBelanja(),
    listSumberDana(),
    listMetodePbj(),
    listJenisKontrak(),
    listPenyedia(),
    listLembaga(),
    listKonsultan(),
    listUsers(),
    listProgramKegiatan(bidangId),
    listProvinsi(),
  ]);
  const opdUsers = users.filter((u) => u.opd_id === opdId);

  let kab: Opt[] = [];
  let kec: Opt[] = [];
  let desa: Opt[] = [];
  let kecamatanId: number | null = null;
  if (lokasi) {
    const desaRow = await getDesa(lokasi.desaId);
    kecamatanId = desaRow?.kecamatan_distrik_id ?? null;
    const [kabRows, kecRows, desaRows] = await Promise.all([
      listKabKota(lokasi.provinsiId),
      listKecamatan(lokasi.kabKotaId),
      kecamatanId ? listDesaByKecamatan(kecamatanId) : Promise.resolve([]),
    ]);
    kab = kabRows.map((r) => ({ id: r.kab_kota_provinsi_id, label: r.kab_kota_provinsi_nama }));
    kec = kecRows.map((r) => ({ id: r.kecamatan_distrik_id, label: r.kecamatan_distrik_name }));
    desa = desaRows.map((r) => ({ id: r.desa_kelurahan_id, label: r.desa_kelurahan_name }));
  }

  return {
    jb: jb.map((r) => ({ id: r.id, label: `${r.kode} ${r.nama}` })),
    sd: sd.map((r) => ({ id: r.id, label: `${r.kode} ${r.nama}` })),
    md: md.map((r) => ({ id: r.id, label: `${r.kode} ${r.metode_pbj_name}` })),
    jk: jk.map((r) => ({ id: r.id, label: `${r.kode} ${r.jenis_kontrak}` })),
    peny: peny.map((r) => ({ id: r.id, label: r.nama })),
    lem: lem.map((r) => ({ id: r.id, label: r.nama })),
    kon: kon.map((r) => ({
      id: r.id,
      label: `${r.nama_konsultan} (${r.jenis_konsultan})`,
    })),
    users: opdUsers.map((r) => ({
      id: r.id,
      label: `${r.nama}${r.jabatan ? ` · ${r.jabatan}` : ""}${r.nip ? ` · ${r.nip}` : ""}`,
    })),
    prog: prog.map((r) => ({
      id: r.id,
      label: `${r.kode_program_kegiatan} · ${r.kegiatan}`,
    })),
    prov: prov.map((r) => ({ id: r.provinsi_id, label: r.provinsi_name })),
    kab,
    kec,
    desa,
    kecamatanId,
  };
}

rfkRoutes.get("/rfk/baru", async (c) => {
  const user = currentUser(c);
  if (user.role !== "staf" || !user.bidang_id) return c.redirect("/rfk");
  const l = await formLookups(user.opd_id, user.bidang_id);
  return c.html(
    page({
      title: "Paket baru",
      user,
      body: `<h1>Paket / kontrak baru</h1>
      <p class="muted">Data dicatat di tingkat bidang Anda dan terikat ke satu kontrak perjanjian.</p>
      <form class="card" method="post">
        ${paketFields(l)}
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/rfk">Batal</a></div>
      </form>`,
    }),
  );
});

type FormLookups = Awaited<ReturnType<typeof formLookups>>;
type KontrakRow = NonNullable<Awaited<ReturnType<typeof getKontrak>>>;
type TrxRow = NonNullable<Awaited<ReturnType<typeof getRfk>>>;

function paketFields(
  l: FormLookups,
  t?: TrxRow,
  k?: KontrakRow | null,
) {
  return `<div class="grid cols-2">
    <div><label>Nomor kontrak/SPK</label><input name="kontrak_no" required value="${k?.kontrak_no ?? ""}"></div>
    <div><label>Nama paket</label><input name="kontrak_nama_paket" required value="${k?.kontrak_nama_paket ?? ""}"></div>
    <div><label>Tanggal kontrak</label><input type="date" name="kontrak_tanggal" value="${k ? isoDate(k.kontrak_tanggal) : ""}"></div>
    <div><label>Tanggal mulai</label><input type="date" name="kontrak_tanggal_mulai" value="${k ? isoDate(k.kontrak_tanggal_mulai) : ""}"></div>
    <div><label>Tanggal selesai</label><input type="date" name="kontrak_tanggal_selesai" value="${k ? isoDate(k.kontrak_tanggal_selesai) : ""}"></div>
    <div><label>Jangka waktu (hari)</label><input name="kontrak_jangka_waktu" type="number" min="0" value="${k?.kontrak_jangka_waktu ?? ""}"></div>
    <div><label>HPS (Rp)</label><input name="kontrak_hps" type="number" min="0" step="1" value="${k?.kontrak_hps ?? ""}"></div>
    <div><label>Nilai kontrak (Rp)</label><input name="kontrak_nilai" type="number" min="0" step="1" required value="${k?.kontrak_nilai ?? ""}"></div>
    <div><label>Jenis kontrak</label><select name="kontrak_jenis_id" required>${options(l.jk, k?.kontrak_jenis_id)}</select></div>
    <div><label>Program / kegiatan bidang</label><select name="program_kegiatan_id">${options(l.prog, t?.program_kegiatan_id)}</select></div>
    <div><label>Jenis belanja</label><select name="jenis_belanja_id" required>${options(l.jb, t?.jenis_belanja_id)}</select></div>
    <div><label>Sumber dana</label><select name="sumber_dana_id" required>${options(l.sd, t?.sumber_dana_id)}</select></div>
    <div><label>Metode PBJ</label><select name="metode_pbj_id" required>${options(l.md, t?.metode_pbj_id)}</select></div>
    <div><label>Penyedia</label><select name="kontrak_penyedia">${options(l.peny, k?.kontrak_penyedia)}</select></div>
    <div><label>Lembaga hibah</label><select name="kontrak_lembaga">${options(l.lem, k?.kontrak_lembaga)}</select></div>
    <div><label>Konsultan pengawas</label><select name="kontrak_pengawas">${options(l.kon, k?.kontrak_pengawas)}</select></div>
    <div><label>PPK (pengguna OPD)</label><select name="ppk" required>${options(l.users, t?.ppk ?? k?.kontrak_ppk)}</select></div>
    <div><label>PPTK (pengguna OPD)</label><select name="pptk" required>${options(l.users, t?.pptk ?? k?.kontrak_pptk)}</select></div>
  </div>
  <h3>Lokasi pekerjaan</h3>
  <div class="grid cols-2" data-wilayah>
    <div><label>Provinsi</label><select name="kontrak_provinsi_id" data-w="prov" required>${options(l.prov, k?.kontrak_provinsi_id)}</select></div>
    <div><label>Kabupaten/Kota</label><select name="kontrak_kab_kota_id" data-w="kab" required>${options(l.kab, k?.kontrak_kab_kota_id)}</select></div>
    <div><label>Kecamatan/Distrik</label><select name="kecamatan_id" data-w="kec" required>${options(l.kec, l.kecamatanId)}</select></div>
    <div><label>Desa/Kelurahan</label><select name="kontrak_desa_kelurahan_id" data-w="desa" required>${options(l.desa, k?.kontrak_desa_kelurahan_id)}</select></div>
  </div>
  <label>Keterangan kontrak</label><textarea name="kontrak_keterangan">${k?.kontrak_keterangan ?? ""}</textarea>
  <label>Catatan</label><textarea name="catatan">${t?.catatan ?? ""}</textarea>
  <script>
    (function () {
      var root = document.querySelector("[data-wilayah]");
      if (!root || root.dataset.ready) return;
      root.dataset.ready = "1";
      var sel = {};
      root.querySelectorAll("select[data-w]").forEach(function (s) { sel[s.dataset.w] = s; });
      function reset(s) { s.innerHTML = '<option value="">—</option>'; }
      function load(url, target) {
        reset(target);
        return fetch(url).then(function (r) { return r.json(); }).then(function (rows) {
          rows.forEach(function (r) {
            var o = document.createElement("option");
            o.value = r.id; o.textContent = r.label; target.appendChild(o);
          });
        });
      }
      sel.prov.addEventListener("change", function () {
        reset(sel.kec); reset(sel.desa);
        if (sel.prov.value) load("/api/wilayah/kab-kota/" + sel.prov.value, sel.kab); else reset(sel.kab);
      });
      sel.kab.addEventListener("change", function () {
        reset(sel.desa);
        if (sel.kab.value) load("/api/wilayah/kecamatan/" + sel.kab.value, sel.kec); else reset(sel.kec);
      });
      sel.kec.addEventListener("change", function () {
        if (sel.kec.value) load("/api/wilayah/desa/" + sel.kec.value, sel.desa); else reset(sel.desa);
      });
    })();
  </script>`;
}

function parsePaket(b: Record<string, unknown>): PaketInput {
  return {
    kontrak_jenis_id: reqNum(b.kontrak_jenis_id, "Jenis kontrak"),
    kontrak_no: String(b.kontrak_no),
    kontrak_nama_paket: String(b.kontrak_nama_paket),
    kontrak_tanggal: String(b.kontrak_tanggal || "") || null,
    kontrak_tanggal_mulai: String(b.kontrak_tanggal_mulai || "") || null,
    kontrak_tanggal_selesai: String(b.kontrak_tanggal_selesai || "") || null,
    kontrak_jangka_waktu: opt(b.kontrak_jangka_waktu),
    kontrak_hps: b.kontrak_hps ? Number(b.kontrak_hps) : null,
    kontrak_nilai: b.kontrak_nilai ? Number(b.kontrak_nilai) : null,
    kontrak_lembaga: opt(b.kontrak_lembaga),
    kontrak_penyedia: opt(b.kontrak_penyedia),
    kontrak_pengawas: opt(b.kontrak_pengawas),
    kontrak_keterangan: String(b.kontrak_keterangan || "") || null,
    kontrak_provinsi_id: reqNum(b.kontrak_provinsi_id, "Provinsi"),
    kontrak_kab_kota_id: reqNum(b.kontrak_kab_kota_id, "Kabupaten/kota"),
    kontrak_desa_kelurahan_id: reqNum(b.kontrak_desa_kelurahan_id, "Desa/kelurahan"),
    jenis_belanja_id: reqNum(b.jenis_belanja_id, "Jenis belanja"),
    sumber_dana_id: reqNum(b.sumber_dana_id, "Sumber dana"),
    metode_pbj_id: reqNum(b.metode_pbj_id, "Metode PBJ"),
    program_kegiatan_id: opt(b.program_kegiatan_id),
    ppk: reqNum(b.ppk, "PPK"),
    pptk: reqNum(b.pptk, "PPTK"),
    catatan: String(b.catatan || "") || null,
  };
}

rfkRoutes.post("/rfk/baru", async (c) => {
  const user = currentUser(c);
  if (user.role !== "staf" || !user.bidang_id) return c.redirect("/rfk");
  try {
    const b = (await c.req.parseBody()) as Record<string, unknown>;
    const id = await createRfk({
      ...parsePaket(b),
      bidang_id: user.bidang_id,
      user_id: user.id,
    });
    return c.redirect(`/rfk/${id}?ok=${encodeURIComponent("Paket tersimpan.")}`);
  } catch (e) {
    return c.redirect(`/rfk/baru?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.get("/rfk/:id", async (c) => {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  const t = await getRfk(id);
  if (!t || !(await canAccess(user, t))) return c.redirect("/rfk");
  const bidang = await getBidang(t.bidang_id);
  const kontrak = await getKontrak(t.kontrak_id);
  if (!kontrak) return c.redirect("/rfk");
  const opdId = bidang?.id_opd ?? user.opd_id;
  const [ads, byr, sts, prog, pho, ev, hist, lookups] = await Promise.all([
    addenda(id),
    pembayaran(id),
    stsList(id),
    progressList(id),
    phoList(id),
    evidenceList(id),
    history(id),
    formLookups(opdId, t.bidang_id, {
      provinsiId: kontrak.kontrak_provinsi_id,
      kabKotaId: kontrak.kontrak_kab_kota_id,
      desaId: kontrak.kontrak_desa_kelurahan_id,
    }),
  ]);
  const nilai = nilaiBerlaku(kontrak.kontrak_nilai, ads);
  const pf = persenFisik(prog);
  const pk = persenKeuangan(nilai, byr);
  const late = kontrak.kontrak_tanggal_selesai
    ? terlambat(isoDate(kontrak.kontrak_tanggal_selesai), pho)
    : false;
  const draft = t.verval_status === "Draft" && user.role === "staf";
  const err = c.req.query("err");
  const ok = c.req.query("ok");

  return c.html(
    page({
      title: kontrak.kontrak_nama_paket,
      user,
      error: err,
      notice: ok,
      body: `<h1>${kontrak.kontrak_nama_paket}</h1>
      <p class="lead">${kontrak.kontrak_no} · ${statusLabel[t.verval_status]} ${late ? "· Terlambat" : ""}</p>
      <div class="grid cols-4">
        <div class="stat"><span class="muted">Nilai berlaku</span><b>${money(nilai)}</b></div>
        <div class="stat"><span class="muted">Fisik</span><b>${num(pf)}%</b><div class="bar"><span style="width:${pf}%"></span></div></div>
        <div class="stat"><span class="muted">Keuangan</span><b>${num(pk)}%</b><div class="bar gold"><span style="width:${pk}%"></span></div></div>
        <div class="stat"><span class="muted">Selisih fisik−keuangan</span><b>${num(pf - pk)} poin</b></div>
      </div>
      ${
        draft
          ? `<form class="card" method="post" action="/rfk/${id}">
              ${paketFields(lookups, t, kontrak)}
              <div class="actions"><button>Perbarui</button></div>
            </form>`
          : `<div class="card muted">Data terkunci setelah masuk verval.</div>`
      }

      <div class="card">
        <h2>Addendum</h2>
        <table><tbody>${ads.map((a) => `<tr><td>${a.nomor_addenddum}</td><td>${isoDate(a.tanggal_addenddum)}</td><td>${money(a.nilai_baru ?? 0)}</td><td>${a.uraian_addenddum ?? ""}</td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
        ${draft ? `<form method="post" action="/rfk/${id}/addendum" class="grid cols-2">
          <div><label>Nomor</label><input name="nomor_addenddum" required></div>
          <div><label>Tanggal</label><input type="date" name="tanggal_addenddum" required></div>
          <div><label>Nilai baru</label><input type="number" name="nilai_baru" required></div>
          <div><label>Uraian</label><input name="uraian_addenddum"></div>
          <div class="actions"><button>Tambah addendum</button></div>
        </form>` : ""}
      </div>

      <div class="card">
        <h2>Pembayaran (termin)</h2>
        <table><tbody>${byr.map((a) => `<tr><td>Termin ${a.termin}</td><td>${isoDate(a.tanggal)}</td><td>${money(a.nilai)}</td><td>${a.uraian ?? ""}</td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
        ${draft ? `<form method="post" action="/rfk/${id}/pembayaran" class="grid cols-2">
          <div><label>Termin</label><input type="number" name="termin" min="1" required></div>
          <div><label>Tanggal</label><input type="date" name="tanggal" required></div>
          <div><label>Nilai</label><input type="number" name="nilai" required></div>
          <div><label>Uraian</label><input name="uraian"></div>
          <div class="actions"><button>Tambah pembayaran</button></div>
        </form>` : ""}
      </div>

      <div class="card">
        <h2>STS / denda</h2>
        <table><tbody>${sts.map((a) => `<tr><td>${a.nomor_sts}</td><td>${isoDate(a.tanggal)}</td><td>${money(a.nilai_kelebihan_bayar_atau_denda)}</td><td>${a.uraian ?? ""}</td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
        ${draft ? `<form method="post" action="/rfk/${id}/sts" class="grid cols-2">
          <div><label>Nomor STS</label><input name="nomor_sts" required></div>
          <div><label>Tanggal</label><input type="date" name="tanggal" required></div>
          <div><label>Nilai denda / kelebihan bayar</label><input type="number" name="nilai_kelebihan_bayar_atau_denda" required></div>
          <div><label>Uraian</label><input name="uraian"></div>
          <div class="actions"><button>Tambah STS</button></div>
        </form>` : ""}
      </div>

      <div class="card">
        <h2>Prestasi fisik</h2>
        <table><tbody>${prog.map((a) => `<tr><td>${isoDate(a.tanggal)}</td><td>${num(a.persen)}%</td><td>${a.uraian ?? ""}</td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
        ${draft ? `<form method="post" action="/rfk/${id}/fisik" class="grid cols-2">
          <div><label>Tanggal</label><input type="date" name="tanggal" required></div>
          <div><label>Persen</label><input type="number" name="persen" min="0" max="100" step="0.01" required></div>
          <div><label>Uraian</label><input name="uraian"></div>
          <div class="actions"><button>Tambah prestasi</button></div>
        </form>` : ""}
      </div>

      <div class="card">
        <h2>PHO / BAST</h2>
        <table><tbody>${pho.map((a) => `<tr><td>${a.jenis}</td><td>${a.nomor}</td><td>${isoDate(a.tanggal)}</td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
        ${draft ? `<form method="post" action="/rfk/${id}/pho" class="grid cols-2">
          <div><label>Jenis</label><select name="jenis"><option>PHO</option><option>BAST</option></select></div>
          <div><label>Nomor</label><input name="nomor" required></div>
          <div><label>Tanggal</label><input type="date" name="tanggal" required></div>
          <div class="actions"><button>Tambah</button></div>
        </form>` : ""}
      </div>

      <div class="card">
        <h2>Bukti</h2>
        <table><tbody>${ev.map((a) => `<tr><td>${a.jenis}</td><td><a href="/rfk/${id}/bukti/${a.id}">${a.original_name}</a></td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
        ${user.role === "staf" ? `<form method="post" action="/rfk/${id}/bukti" enctype="multipart/form-data">
          <label>Jenis</label>
          <select name="jenis"><option value="kontrak">Kontrak</option><option value="bast">BAST</option><option value="foto">Foto lokasi</option><option value="video">Video lokasi</option></select>
          <label>Berkas</label><input type="file" name="berkas" required>
          <div class="actions"><button>Unggah</button></div>
        </form>` : ""}
      </div>

      <div class="card">
        <h2>Riwayat verval</h2>
        <table><tbody>${hist.map((h) => `<tr><td>${isoDate(h.created_at)}</td><td>${h.petugas}</td><td>${statusLabel[h.from_status]} → ${statusLabel[h.to_status]}</td><td>${h.catatan ?? ""}</td></tr>`).join("") || "<tr><td>Belum ada</td></tr>"}</tbody></table>
      </div>
      <p><a class="btn ghost" href="/rfk">Kembali ke daftar</a></p>`,
    }),
  );
});

rfkRoutes.post("/rfk/:id", async (c) => {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  try {
    if (user.role !== "staf") throw new Error("Hanya staf yang mengubah paket.");
    const t = await getRfk(id);
    if (!t || !(await canAccess(user, t))) throw new Error("Tidak diizinkan.");
    const b = (await c.req.parseBody()) as Record<string, unknown>;
    await updateRfk(id, parsePaket(b), user.id);
    return c.redirect(`/rfk/${id}?ok=${encodeURIComponent("Tersimpan.")}`);
  } catch (e) {
    return c.redirect(`/rfk/${id}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

async function withDraftStaf(
  c: Parameters<typeof currentUser>[0],
  fn: (id: number, actor: number) => Promise<void>,
) {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  if (user.role !== "staf") throw new Error("Hanya staf.");
  const t = await getRfk(id);
  if (!t || !(await canAccess(user, t))) throw new Error("Tidak diizinkan.");
  await fn(id, user.id);
}

rfkRoutes.post("/rfk/:id/addendum", async (c) => {
  try {
    const b = await c.req.parseBody();
    await withDraftStaf(c, (id, actor) =>
      addAddendum(
        {
          transaksi_id: id,
          nomor_addenddum: String(b.nomor_addenddum),
          tanggal_addenddum: String(b.tanggal_addenddum),
          nilai_baru: String(b.nilai_baru),
          uraian_addenddum: String(b.uraian_addenddum || "") || null,
        },
        actor,
      ),
    );
    return c.redirect(`/rfk/${c.req.param("id")}?ok=Addendum`);
  } catch (e) {
    return c.redirect(`/rfk/${c.req.param("id")}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.post("/rfk/:id/pembayaran", async (c) => {
  try {
    const b = await c.req.parseBody();
    await withDraftStaf(c, (id, actor) =>
      addPembayaran(
        {
          transaksi_id: id,
          termin: Number(b.termin),
          tanggal: String(b.tanggal),
          nilai: String(b.nilai),
          uraian: String(b.uraian || "") || null,
        },
        actor,
      ),
    );
    return c.redirect(`/rfk/${c.req.param("id")}?ok=Pembayaran`);
  } catch (e) {
    return c.redirect(`/rfk/${c.req.param("id")}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.post("/rfk/:id/sts", async (c) => {
  try {
    const b = await c.req.parseBody();
    await withDraftStaf(c, (id, actor) =>
      addSts(
        {
          transaksi_rfk_id: id,
          tanggal: String(b.tanggal),
          nilai_kelebihan_bayar_atau_denda: String(b.nilai_kelebihan_bayar_atau_denda),
          nomor_sts: String(b.nomor_sts),
          uraian: String(b.uraian || "") || null,
        },
        actor,
      ),
    );
    return c.redirect(`/rfk/${c.req.param("id")}?ok=STS`);
  } catch (e) {
    return c.redirect(`/rfk/${c.req.param("id")}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.post("/rfk/:id/fisik", async (c) => {
  try {
    const b = await c.req.parseBody();
    await withDraftStaf(c, (id, actor) =>
      addProgress(
        {
          transaksi_id: id,
          tanggal: String(b.tanggal),
          persen: String(b.persen),
          uraian: String(b.uraian || "") || null,
        },
        actor,
      ),
    );
    return c.redirect(`/rfk/${c.req.param("id")}?ok=Fisik`);
  } catch (e) {
    return c.redirect(`/rfk/${c.req.param("id")}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.post("/rfk/:id/pho", async (c) => {
  try {
    const b = await c.req.parseBody();
    await withDraftStaf(c, (id, actor) =>
      addPho(
        {
          transaksi_id: id,
          jenis: String(b.jenis) as "PHO" | "BAST",
          tanggal: String(b.tanggal),
          nomor: String(b.nomor),
        },
        actor,
      ),
    );
    return c.redirect(`/rfk/${c.req.param("id")}?ok=PHO`);
  } catch (e) {
    return c.redirect(`/rfk/${c.req.param("id")}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.post("/rfk/:id/bukti", async (c) => {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  try {
    if (user.role !== "staf") throw new Error("Hanya staf.");
    const t = await getRfk(id);
    if (!t || !(await canAccess(user, t))) throw new Error("Tidak diizinkan.");
    const b = await c.req.parseBody();
    const file = b.berkas;
    if (!(file instanceof File)) throw new Error("Berkas wajib diunggah.");
    const ext = extname(file.name) || "";
    const stored = `${randomUUID()}${ext}`;
    await writeFile(join(uploadsDir(), stored), Buffer.from(await file.arrayBuffer()));
    await addEvidence(
      {
        transaksi_id: id,
        jenis: String(b.jenis) as "kontrak" | "bast" | "foto" | "video",
        stored_name: stored,
        original_name: file.name,
      },
      user.id,
    );
    return c.redirect(`/rfk/${id}?ok=${encodeURIComponent("Bukti terunggah.")}`);
  } catch (e) {
    return c.redirect(`/rfk/${id}?err=${encodeURIComponent((e as Error).message)}`);
  }
});

rfkRoutes.get("/rfk/:id/bukti/:eid", async (c) => {
  const user = currentUser(c);
  const id = Number(c.req.param("id"));
  const t = await getRfk(id);
  if (!t || !(await canAccess(user, t))) return c.redirect("/rfk");
  const ev = (await evidenceList(id)).find((e) => e.id === Number(c.req.param("eid")));
  if (!ev) return c.notFound();
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(join(uploadsDir(), ev.stored_name));
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ev.original_name}"`,
    },
  });
});

