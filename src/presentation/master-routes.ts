import { Hono } from "hono";
import type { Context } from "hono";
import {
  actionButtons,
  applyList,
  currentUser,
  escapeHtml,
  hasRole,
  money,
  page,
  parseListQuery,
  requireUser,
  roleLabel,
  rowNumber,
  renderTableChrome,
  sortTh,
} from "../kernel/index.js";
import {
  createBidang,
  createOpd,
  getEntitas,
  listBidang,
  listDesaKelurahan,
  listKabKota,
  listOpd,
  listProvinsi,
  upsertEntitas,
} from "../organization/index.js";
import { createUser, listUsers } from "../identity/index.js";
import {
  createJenisBelanja,
  createJenisKontrak,
  createMetodePbj,
  createProgramKegiatan,
  createSumberDana,
  deleteJenisBelanja,
  deleteJenisKontrak,
  deleteMetodePbj,
  deleteProgramKegiatan,
  deleteSumberDana,
  getJenisBelanja,
  getJenisKontrak,
  getMetodePbj,
  getProgramKegiatan,
  getSumberDana,
  listJenisBelanja,
  listJenisKontrak,
  listMetodePbj,
  listProgramKegiatan,
  listSumberDana,
  updateJenisBelanja,
  updateJenisKontrak,
  updateMetodePbj,
  updateProgramKegiatan,
  updateSumberDana,
} from "../catalog/index.js";
import {
  createKonsultan,
  createLembaga,
  createPenyedia,
  listKonsultan,
  listLembaga,
  listPenyedia,
} from "../parties/index.js";
import type { Role } from "../kernel/tables.js";

export const masterRoutes = new Hono();

masterRoutes.use("/data-induk/*", requireUser);
masterRoutes.use("/data-induk", requireUser);

function guard(c: Context) {
  return hasRole(currentUser(c), ["administrator"]);
}

masterRoutes.get("/data-induk", async (c) => {
  const user = currentUser(c);
  if (!hasRole(user, ["administrator"])) return c.redirect("/");
  const links = [
    ["/data-induk/program-kegiatan", "Program Kegiatan Bidang"],
    ["/data-induk/entitas", "Entitas"],
    ["/data-induk/opd", "OPD"],
    ["/data-induk/bidang", "Bidang"],
    ["/data-induk/pengguna", "Pengguna (termasuk PPK/PPTK)"],
    ["/data-induk/jenis-belanja", "Jenis belanja"],
    ["/data-induk/sumber-dana", "Sumber dana"],
    ["/data-induk/metode-pbj", "Metode pemilihan PBJ"],
    ["/data-induk/jenis-kontrak", "Jenis kontrak"],
    ["/data-induk/provinsi", "Provinsi (master)"],
    ["/data-induk/kabupaten-kota", "Kabupaten/Kota (master)"],
    ["/data-induk/desa-kelurahan", "Desa/Kelurahan (master)"],
    ["/data-induk/penyedia", "Penyedia"],
    ["/data-induk/lembaga", "Lembaga penerima hibah"],
    ["/data-induk/konsultan", "Konsultan"],
  ];
  return c.html(
    page({
      title: "Data Induk",
      user,
      body: `<h1>Data Induk</h1>
      <div class="grid cols-2 tiles">${links.map(([h, l]) => `<a href="${h}"><strong>${l}</strong></a>`).join("")}</div>`,
    }),
  );
});

masterRoutes.get("/data-induk/entitas", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const [e, provinsi] = await Promise.all([getEntitas(), listProvinsi()]);
  return c.html(
    page({
      title: "Entitas",
      user,
      body: `<h1>Entitas</h1>
      <form class="card" method="post">
        <label>Nama entitas</label><input name="entitas_name" value="${e?.entitas_name ?? ""}" required>
        <label>Provinsi</label>
        <select name="id_provinsi" required>
          ${provinsi
            .map(
              (p) =>
                `<option value="${p.provinsi_id}" ${e?.id_provinsi === p.provinsi_id ? "selected" : ""}>${p.provinsi_name}</option>`,
            )
            .join("")}
        </select>
        <label>Alamat</label><textarea name="alamat">${e?.alamat ?? ""}</textarea>
        <label>Tahun berdiri</label><input name="tahun_berdiri" type="number" value="${e?.tahun_berdiri ?? ""}">
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/data-induk">Kembali</a></div>
      </form>`,
    }),
  );
});

masterRoutes.post("/data-induk/entitas", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const user = currentUser(c);
  const b = await c.req.parseBody();
  const existing = await getEntitas();
  await upsertEntitas(
    {
      entitas_name: String(b.entitas_name),
      id_provinsi: Number(b.id_provinsi),
      alamat: String(b.alamat || "") || null,
      tahun_berdiri: b.tahun_berdiri ? Number(b.tahun_berdiri) : null,
      file_logo_entitas: existing?.file_logo_entitas ?? null,
    },
    user.id,
  );
  return c.redirect("/data-induk/entitas");
});

masterRoutes.get("/data-induk/opd", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const [rows, entitas] = await Promise.all([listOpd(), getEntitas()]);
  return c.html(
    page({
      title: "OPD",
      user,
      error: c.req.query("err"),
      body: `<h1>OPD</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Nama OPD</label><input name="opd_name" required></div>
          <div><label>Tugas/fungsi</label><input name="tugas_fungsi"></div>
          <div><label>Alamat kantor</label><input name="alamat_kantor"></div>
          <div><label>No. telp</label><input name="no_telp"></div>
          <div><label>Email</label><input name="email"></div>
        </div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      <table><thead><tr><th>No</th><th>Nama</th><th>Tugas/fungsi</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.opd_name)}</td><td>${escapeHtml(r.tugas_fungsi ?? "")}</td></tr>`).join("")}</tbody></table>
      ${!entitas ? `<p class="muted">Simpan entitas terlebih dahulu sebelum menambah OPD.</p>` : ""}`,
    }),
  );
});

masterRoutes.post("/data-induk/opd", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const entitas = await getEntitas();
  if (!entitas) {
    return c.redirect(
      `/data-induk/opd?err=${encodeURIComponent("Entitas belum diisi.")}`,
    );
  }
  const b = await c.req.parseBody();
  await createOpd(
    {
      id_entitas: entitas.id,
      opd_name: String(b.opd_name),
      tugas_fungsi: String(b.tugas_fungsi || "") || null,
      alamat_kantor: String(b.alamat_kantor || "") || null,
      no_telp: String(b.no_telp || "") || null,
      email: String(b.email || "") || null,
    },
    currentUser(c).id,
  );
  return c.redirect("/data-induk/opd");
});

masterRoutes.get("/data-induk/bidang", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const [rows, opd] = await Promise.all([listBidang(), listOpd()]);
  return c.html(
    page({
      title: "Bidang",
      user,
      body: `<h1>Bidang</h1>
      <p class="muted">Sub unit OPD. Bidang bernama Sekretariat dapat mengonsolidasi laporan RFK tingkat OPD.</p>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>OPD</label><select name="id_opd">${opd.map((o) => `<option value="${o.id}">${o.opd_name}</option>`).join("")}</select></div>
          <div><label>Nama bidang</label><input name="bidang_name" required placeholder="mis. Sekretariat"></div>
          <div><label>Fungsi bidang</label><input name="bidang_fungsi" required placeholder="Uraian tugas/fungsi"></div>
        </div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      <table><thead><tr><th>Nama</th><th>Fungsi</th><th>OPD</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const o = opd.find((x) => x.id === r.id_opd);
          return `<tr><td>${r.bidang_name}</td><td>${r.bidang_fungsi}</td><td>${o?.opd_name ?? ""}</td></tr>`;
        })
        .join("")}</tbody></table>
      <p><a class="btn ghost" href="/data-induk">Kembali</a></p>`,
    }),
  );
});

masterRoutes.post("/data-induk/bidang", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createBidang(
    {
      id_opd: Number(b.id_opd),
      bidang_name: String(b.bidang_name),
      bidang_fungsi: String(b.bidang_fungsi),
    },
    currentUser(c).id,
  );
  return c.redirect("/data-induk/bidang");
});

masterRoutes.get("/data-induk/pengguna", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const [users, opd, bidang] = await Promise.all([
    listUsers(),
    listOpd(),
    listBidang(),
  ]);
  return c.html(
    page({
      title: "Pengguna",
      user,
      error: c.req.query("err"),
      body: `<h1>Pengguna</h1>
      <p class="muted">Administrator sistem · staf bidang · kepala bidang (1 per bidang) · pimpinan (1 per OPD). Bidang wajib. Pengguna yang menjabat PPK/PPTK dipilih dari daftar ini pada form kontrak — isi kolom Jabatan.</p>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Nama</label><input name="nama" required></div>
          <div><label>NIP</label><input name="nip" inputmode="numeric"></div>
          <div><label>Jabatan</label><input name="jabatan" placeholder="mis. PPK, PPTK, Kepala Bidang"></div>
          <div><label>Nama pengguna</label><input name="username" required></div>
          <div><label>Kata sandi</label><input name="password" type="password" required></div>
          <div><label>Bidang</label>
            <select name="bidang_id" required>
              ${bidang
                .map((b) => {
                  const o = opd.find((x) => x.id === b.id_opd);
                  return `<option value="${b.id}">${b.bidang_name} · ${o?.opd_name ?? ""}</option>`;
                })
                .join("")}
            </select>
          </div>
          <div><label>Peran</label>
            <select name="role">
              <option value="administrator">Administrator Sistem</option>
              <option value="staf">Staf Bidang</option>
              <option value="kepala_bidang">Kepala Bidang</option>
              <option value="pimpinan">Pimpinan</option>
            </select>
          </div>
        </div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      <table><thead><tr><th>Nama</th><th>NIP</th><th>Jabatan</th><th>Pengguna</th><th>Peran</th><th>OPD</th><th>Bidang</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${escapeHtml(u.nama)}</td><td>${escapeHtml(u.nip ?? "")}</td><td>${escapeHtml(u.jabatan ?? "")}</td><td>${escapeHtml(u.username)}</td><td>${roleLabel(u.role)}</td><td>${escapeHtml(u.opd_nama)}</td><td>${escapeHtml(u.bidang_nama ?? "—")}</td></tr>`).join("")}</tbody></table>
      <p><a class="btn ghost" href="/data-induk">Kembali</a></p>`,
    }),
  );
});

masterRoutes.post("/data-induk/pengguna", async (c) => {
  if (!guard(c)) return c.redirect("/");
  try {
    const b = await c.req.parseBody();
    const role = String(b.role) as Role;
    const bidangId = Number(b.bidang_id);
    if (!bidangId) throw new Error("Bidang wajib dipilih.");
    await createUser(
      {
        nama: String(b.nama),
        username: String(b.username),
        password: String(b.password),
        bidang_id: bidangId,
        role,
        nip: String(b.nip || "").trim() || null,
        jabatan: String(b.jabatan || "").trim() || null,
      },
      currentUser(c).id,
    );
    return c.redirect("/data-induk/pengguna");
  } catch (e) {
    return c.redirect(
      `/data-induk/pengguna?err=${encodeURIComponent((e as Error).message)}`,
    );
  }
});

masterRoutes.get("/data-induk/program-kegiatan", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const path = "/data-induk/program-kegiatan";
  const query = parseListQuery(c.req, { sort: "kode" });
  const [all, bidang] = await Promise.all([listProgramKegiatan(), listBidang()]);
  const bidangName = (id: number) =>
    bidang.find((b) => b.id === id)?.bidang_name ?? "";
  const { pageRows, total, query: q } = applyList(all, query, {
    match: (r, s) =>
      `${r.kode_program_kegiatan} ${r.program} ${r.kegiatan} ${bidangName(r.bidang_id)}`
        .toLowerCase()
        .includes(s),
    getters: {
      kode: (r) => r.kode_program_kegiatan,
      program: (r) => r.program,
      kegiatan: (r) => r.kegiatan,
      bidang: (r) => bidangName(r.bidang_id),
      pagu: (r) => r.pagu_anggaran ?? 0,
    },
  });
  const head = `<th>No</th>${sortTh(path, q, "kode", "Kode")}${sortTh(path, q, "program", "Program")}${sortTh(path, q, "kegiatan", "Kegiatan")}${sortTh(path, q, "bidang", "Bidang")}${sortTh(path, q, "pagu", "Pagu", "money")}<th></th>`;
  const body = pageRows
    .map(
      (r, i) => `<tr>
        <td>${rowNumber(q, i)}</td>
        <td>${escapeHtml(r.kode_program_kegiatan)}</td>
        <td>${escapeHtml(r.program)}</td>
        <td>${escapeHtml(r.kegiatan)}</td>
        <td>${escapeHtml(bidangName(r.bidang_id))}</td>
        <td class="money">${money(r.pagu_anggaran ?? 0)}</td>
        ${actionButtons(`${path}/${r.id}/ubah`, `${path}/${r.id}/hapus`)}
      </tr>`,
    )
    .join("");
  return c.html(
    page({
      title: "Data Program Kegiatan Bidang",
      user,
      path,
      notice: c.req.query("ok"),
      error: c.req.query("err"),
      body: `<h1>Data Program Kegiatan Bidang</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Bidang</label><select name="bidang_id" required>${bidang.map((b) => `<option value="${b.id}">${escapeHtml(b.bidang_name)}</option>`).join("")}</select></div>
          <div><label>Kode</label><input name="kode_program_kegiatan" required></div>
          <div><label>Program</label><input name="program" required></div>
          <div><label>Kegiatan</label><input name="kegiatan" required></div>
          <div><label>Pagu anggaran</label><input name="pagu_anggaran" type="number" min="0" step="1"></div>
        </div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      ${renderTableChrome({ path, query: q, total, tableHead: head, tableBody: body, emptyColspan: 7 })}`,
    }),
  );
});

masterRoutes.post("/data-induk/program-kegiatan", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  const pagu = b.pagu_anggaran === "" || b.pagu_anggaran == null ? null : Number(b.pagu_anggaran);
  await createProgramKegiatan(
    {
      bidang_id: Number(b.bidang_id),
      kode_program_kegiatan: String(b.kode_program_kegiatan),
      program: String(b.program),
      kegiatan: String(b.kegiatan),
      pagu_anggaran: pagu != null && Number.isFinite(pagu) ? pagu : null,
    },
    currentUser(c).id,
  );
  return c.redirect(pathOk("/data-induk/program-kegiatan", "Data ditambahkan."));
});

masterRoutes.get("/data-induk/program-kegiatan/:id/ubah", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const row = await getProgramKegiatan(Number(c.req.param("id")));
  if (!row) return c.redirect(pathErr("/data-induk/program-kegiatan", "Data tidak ditemukan."));
  const bidang = await listBidang();
  return c.html(
    page({
      title: "Ubah Program Kegiatan",
      user,
      path: "/data-induk/program-kegiatan",
      body: `<h1>Ubah Program Kegiatan Bidang</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Bidang</label><select name="bidang_id" required>${bidang.map((b) => `<option value="${b.id}"${b.id === row.bidang_id ? " selected" : ""}>${escapeHtml(b.bidang_name)}</option>`).join("")}</select></div>
          <div><label>Kode</label><input name="kode_program_kegiatan" value="${escapeHtml(row.kode_program_kegiatan)}" required></div>
          <div><label>Program</label><input name="program" value="${escapeHtml(row.program)}" required></div>
          <div><label>Kegiatan</label><input name="kegiatan" value="${escapeHtml(row.kegiatan)}" required></div>
          <div><label>Pagu anggaran</label><input name="pagu_anggaran" type="number" min="0" step="1" value="${row.pagu_anggaran ?? ""}"></div>
        </div>
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/data-induk/program-kegiatan">Batal</a></div>
      </form>`,
    }),
  );
});

masterRoutes.post("/data-induk/program-kegiatan/:id/ubah", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const id = Number(c.req.param("id"));
  const b = await c.req.parseBody();
  const pagu = b.pagu_anggaran === "" || b.pagu_anggaran == null ? null : Number(b.pagu_anggaran);
  await updateProgramKegiatan(
    id,
    {
      bidang_id: Number(b.bidang_id),
      kode_program_kegiatan: String(b.kode_program_kegiatan),
      program: String(b.program),
      kegiatan: String(b.kegiatan),
      pagu_anggaran: pagu != null && Number.isFinite(pagu) ? pagu : null,
    },
    currentUser(c).id,
  );
  return c.redirect(pathOk("/data-induk/program-kegiatan", "Perubahan disimpan."));
});

masterRoutes.post("/data-induk/program-kegiatan/:id/hapus", async (c) => {
  if (!guard(c)) return c.redirect("/");
  await deleteProgramKegiatan(Number(c.req.param("id")), currentUser(c).id);
  return c.redirect(pathOk("/data-induk/program-kegiatan", "Data dihapus."));
});

function pathOk(path: string, msg: string) {
  return `${path}?ok=${encodeURIComponent(msg)}`;
}
function pathErr(path: string, msg: string) {
  return `${path}?err=${encodeURIComponent(msg)}`;
}

masterRoutes.get("/data-induk/sumber-dana", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const path = "/data-induk/sumber-dana";
  const query = parseListQuery(c.req, { sort: "kode" });
  const all = await listSumberDana();
  const { pageRows, total, query: q } = applyList(all, query, {
    match: (r, s) => `${r.kode} ${r.nama}`.toLowerCase().includes(s),
    getters: { kode: (r) => r.kode, nama: (r) => r.nama },
  });
  const head = `<th>No</th>${sortTh(path, q, "kode", "Kode")}${sortTh(path, q, "nama", "Nama")}<th></th>`;
  const body = pageRows
    .map(
      (r, i) => `<tr>
        <td>${rowNumber(q, i)}</td>
        <td>${escapeHtml(r.kode)}</td>
        <td>${escapeHtml(r.nama)}</td>
        ${actionButtons(`${path}/${r.id}/ubah`, `${path}/${r.id}/hapus`)}
      </tr>`,
    )
    .join("");
  return c.html(
    page({
      title: "Data Sumber Dana",
      user,
      path,
      notice: c.req.query("ok"),
      body: `<h1>Data Sumber Dana</h1>
      <form class="card" method="post">
        <div class="grid cols-2"><div><label>Kode</label><input name="kode" required></div><div><label>Nama</label><input name="nama" required></div></div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      ${renderTableChrome({ path, query: q, total, tableHead: head, tableBody: body, emptyColspan: 4 })}`,
    }),
  );
});

masterRoutes.post("/data-induk/sumber-dana", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createSumberDana({ kode: String(b.kode), nama: String(b.nama) });
  return c.redirect(pathOk("/data-induk/sumber-dana", "Data ditambahkan."));
});

masterRoutes.get("/data-induk/sumber-dana/:id/ubah", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const row = await getSumberDana(Number(c.req.param("id")));
  if (!row) return c.redirect(pathErr("/data-induk/sumber-dana", "Data tidak ditemukan."));
  return c.html(
    page({
      title: "Ubah Sumber Dana",
      user,
      path: "/data-induk/sumber-dana",
      body: `<h1>Ubah Sumber Dana</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Kode</label><input name="kode" value="${escapeHtml(row.kode)}" required></div>
          <div><label>Nama</label><input name="nama" value="${escapeHtml(row.nama)}" required></div>
        </div>
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/data-induk/sumber-dana">Batal</a></div>
      </form>`,
    }),
  );
});

masterRoutes.post("/data-induk/sumber-dana/:id/ubah", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await updateSumberDana(Number(c.req.param("id")), {
    kode: String(b.kode),
    nama: String(b.nama),
  });
  return c.redirect(pathOk("/data-induk/sumber-dana", "Perubahan disimpan."));
});

masterRoutes.post("/data-induk/sumber-dana/:id/hapus", async (c) => {
  if (!guard(c)) return c.redirect("/");
  await deleteSumberDana(Number(c.req.param("id")));
  return c.redirect(pathOk("/data-induk/sumber-dana", "Data dihapus."));
});

masterRoutes.get("/data-induk/metode-pbj", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const path = "/data-induk/metode-pbj";
  const query = parseListQuery(c.req, { sort: "kode" });
  const all = await listMetodePbj();
  const { pageRows, total, query: q } = applyList(all, query, {
    match: (r, s) => `${r.kode} ${r.metode_pbj_name}`.toLowerCase().includes(s),
    getters: { kode: (r) => r.kode, nama: (r) => r.metode_pbj_name },
  });
  const head = `<th>No</th>${sortTh(path, q, "kode", "Kode")}${sortTh(path, q, "nama", "Nama")}<th></th>`;
  const body = pageRows
    .map(
      (r, i) => `<tr>
        <td>${rowNumber(q, i)}</td>
        <td>${escapeHtml(r.kode)}</td>
        <td>${escapeHtml(r.metode_pbj_name)}</td>
        ${actionButtons(`${path}/${r.id}/ubah`, `${path}/${r.id}/hapus`)}
      </tr>`,
    )
    .join("");
  return c.html(
    page({
      title: "Data Metode Pemilihan PBJ",
      user,
      path,
      notice: c.req.query("ok"),
      body: `<h1>Data Metode Pemilihan Penyedia Barang Jasa</h1>
      <form class="card" method="post">
        <div class="grid cols-2"><div><label>Kode</label><input name="kode" required></div><div><label>Nama</label><input name="metode_pbj_name" required></div></div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      ${renderTableChrome({ path, query: q, total, tableHead: head, tableBody: body, emptyColspan: 4 })}`,
    }),
  );
});

masterRoutes.post("/data-induk/metode-pbj", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createMetodePbj({
    kode: String(b.kode),
    metode_pbj_name: String(b.metode_pbj_name),
  });
  return c.redirect(pathOk("/data-induk/metode-pbj", "Data ditambahkan."));
});

masterRoutes.get("/data-induk/metode-pbj/:id/ubah", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const row = await getMetodePbj(Number(c.req.param("id")));
  if (!row) return c.redirect(pathErr("/data-induk/metode-pbj", "Data tidak ditemukan."));
  return c.html(
    page({
      title: "Ubah Metode PBJ",
      user,
      path: "/data-induk/metode-pbj",
      body: `<h1>Ubah Metode Pemilihan PBJ</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Kode</label><input name="kode" value="${escapeHtml(row.kode)}" required></div>
          <div><label>Nama</label><input name="metode_pbj_name" value="${escapeHtml(row.metode_pbj_name)}" required></div>
        </div>
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/data-induk/metode-pbj">Batal</a></div>
      </form>`,
    }),
  );
});

masterRoutes.post("/data-induk/metode-pbj/:id/ubah", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await updateMetodePbj(Number(c.req.param("id")), {
    kode: String(b.kode),
    metode_pbj_name: String(b.metode_pbj_name),
  });
  return c.redirect(pathOk("/data-induk/metode-pbj", "Perubahan disimpan."));
});

masterRoutes.post("/data-induk/metode-pbj/:id/hapus", async (c) => {
  if (!guard(c)) return c.redirect("/");
  await deleteMetodePbj(Number(c.req.param("id")));
  return c.redirect(pathOk("/data-induk/metode-pbj", "Data dihapus."));
});

masterRoutes.get("/data-induk/jenis-kontrak", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const path = "/data-induk/jenis-kontrak";
  const query = parseListQuery(c.req, { sort: "kode" });
  const all = await listJenisKontrak();
  const { pageRows, total, query: q } = applyList(all, query, {
    match: (r, s) => `${r.kode} ${r.jenis_kontrak}`.toLowerCase().includes(s),
    getters: { kode: (r) => r.kode, nama: (r) => r.jenis_kontrak },
  });
  const head = `<th>No</th>${sortTh(path, q, "kode", "Kode")}${sortTh(path, q, "nama", "Jenis kontrak")}<th></th>`;
  const body = pageRows
    .map(
      (r, i) => `<tr>
        <td>${rowNumber(q, i)}</td>
        <td>${escapeHtml(r.kode)}</td>
        <td>${escapeHtml(r.jenis_kontrak)}</td>
        ${actionButtons(`${path}/${r.id}/ubah`, `${path}/${r.id}/hapus`)}
      </tr>`,
    )
    .join("");
  return c.html(
    page({
      title: "Data Jenis Kontrak",
      user,
      path,
      notice: c.req.query("ok"),
      body: `<h1>Data Jenis Kontrak</h1>
      <form class="card" method="post">
        <div class="grid cols-2"><div><label>Kode</label><input name="kode" required></div><div><label>Jenis kontrak</label><input name="jenis_kontrak" required></div></div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      ${renderTableChrome({ path, query: q, total, tableHead: head, tableBody: body, emptyColspan: 4 })}`,
    }),
  );
});

masterRoutes.post("/data-induk/jenis-kontrak", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createJenisKontrak({
    kode: String(b.kode),
    jenis_kontrak: String(b.jenis_kontrak),
  });
  return c.redirect(pathOk("/data-induk/jenis-kontrak", "Data ditambahkan."));
});

masterRoutes.get("/data-induk/jenis-kontrak/:id/ubah", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const row = await getJenisKontrak(Number(c.req.param("id")));
  if (!row) return c.redirect(pathErr("/data-induk/jenis-kontrak", "Data tidak ditemukan."));
  return c.html(
    page({
      title: "Ubah Jenis Kontrak",
      user,
      path: "/data-induk/jenis-kontrak",
      body: `<h1>Ubah Jenis Kontrak</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Kode</label><input name="kode" value="${escapeHtml(row.kode)}" required></div>
          <div><label>Jenis kontrak</label><input name="jenis_kontrak" value="${escapeHtml(row.jenis_kontrak)}" required></div>
        </div>
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/data-induk/jenis-kontrak">Batal</a></div>
      </form>`,
    }),
  );
});

masterRoutes.post("/data-induk/jenis-kontrak/:id/ubah", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await updateJenisKontrak(Number(c.req.param("id")), {
    kode: String(b.kode),
    jenis_kontrak: String(b.jenis_kontrak),
  });
  return c.redirect(pathOk("/data-induk/jenis-kontrak", "Perubahan disimpan."));
});

masterRoutes.post("/data-induk/jenis-kontrak/:id/hapus", async (c) => {
  if (!guard(c)) return c.redirect("/");
  await deleteJenisKontrak(Number(c.req.param("id")));
  return c.redirect(pathOk("/data-induk/jenis-kontrak", "Data dihapus."));
});

masterRoutes.get("/data-induk/jenis-belanja", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const path = "/data-induk/jenis-belanja";
  const query = parseListQuery(c.req, { sort: "kode" });
  const all = await listJenisBelanja();
  const { pageRows, total, query: q } = applyList(all, query, {
    match: (r, s) => `${r.level} ${r.kode} ${r.nama}`.toLowerCase().includes(s),
    getters: {
      level: (r) => r.level,
      kode: (r) => r.kode,
      nama: (r) => r.nama,
    },
  });
  const head = `<th>No</th>${sortTh(path, q, "level", "Tingkat")}${sortTh(path, q, "kode", "Kode")}${sortTh(path, q, "nama", "Nama")}<th></th>`;
  const body = pageRows
    .map(
      (r, i) => `<tr>
        <td>${rowNumber(q, i)}</td>
        <td>${r.level}</td>
        <td>${escapeHtml(r.kode)}</td>
        <td>${escapeHtml(r.nama)}</td>
        ${actionButtons(`${path}/${r.id}/ubah`, `${path}/${r.id}/hapus`)}
      </tr>`,
    )
    .join("");
  return c.html(
    page({
      title: "Data Jenis Belanja",
      user,
      path,
      notice: c.req.query("ok"),
      body: `<h1>Data Jenis Belanja</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Kode</label><input name="kode" required></div>
          <div><label>Nama</label><input name="nama" required></div>
          <div><label>Tingkat (1–3)</label><input name="level" type="number" min="1" max="3" value="1" required></div>
          <div><label>Induk</label>
            <select name="parent_id"><option value="">—</option>${all.map((r) => `<option value="${r.id}">${escapeHtml(r.kode)} ${escapeHtml(r.nama)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="actions"><button>Tambah</button></div>
      </form>
      ${renderTableChrome({ path, query: q, total, tableHead: head, tableBody: body, emptyColspan: 5 })}`,
    }),
  );
});

masterRoutes.post("/data-induk/jenis-belanja", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createJenisBelanja({
    kode: String(b.kode),
    nama: String(b.nama),
    level: Number(b.level),
    parent_id: b.parent_id ? Number(b.parent_id) : null,
  });
  return c.redirect(pathOk("/data-induk/jenis-belanja", "Data ditambahkan."));
});

masterRoutes.get("/data-induk/jenis-belanja/:id/ubah", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const id = Number(c.req.param("id"));
  const [row, all] = await Promise.all([getJenisBelanja(id), listJenisBelanja()]);
  if (!row) return c.redirect(pathErr("/data-induk/jenis-belanja", "Data tidak ditemukan."));
  return c.html(
    page({
      title: "Ubah Jenis Belanja",
      user,
      path: "/data-induk/jenis-belanja",
      body: `<h1>Ubah Jenis Belanja</h1>
      <form class="card" method="post">
        <div class="grid cols-2">
          <div><label>Kode</label><input name="kode" value="${escapeHtml(row.kode)}" required></div>
          <div><label>Nama</label><input name="nama" value="${escapeHtml(row.nama)}" required></div>
          <div><label>Tingkat (1–3)</label><input name="level" type="number" min="1" max="3" value="${row.level}" required></div>
          <div><label>Induk</label>
            <select name="parent_id"><option value="">—</option>${all
              .filter((r) => r.id !== row.id)
              .map(
                (r) =>
                  `<option value="${r.id}"${r.id === row.parent_id ? " selected" : ""}>${escapeHtml(r.kode)} ${escapeHtml(r.nama)}</option>`,
              )
              .join("")}</select>
          </div>
        </div>
        <div class="actions"><button>Simpan</button><a class="btn ghost" href="/data-induk/jenis-belanja">Batal</a></div>
      </form>`,
    }),
  );
});

masterRoutes.post("/data-induk/jenis-belanja/:id/ubah", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await updateJenisBelanja(Number(c.req.param("id")), {
    kode: String(b.kode),
    nama: String(b.nama),
    level: Number(b.level),
    parent_id: b.parent_id ? Number(b.parent_id) : null,
  });
  return c.redirect(pathOk("/data-induk/jenis-belanja", "Perubahan disimpan."));
});

masterRoutes.post("/data-induk/jenis-belanja/:id/hapus", async (c) => {
  if (!guard(c)) return c.redirect("/");
  await deleteJenisBelanja(Number(c.req.param("id")));
  return c.redirect(pathOk("/data-induk/jenis-belanja", "Data dihapus."));
});

masterRoutes.get("/data-induk/penyedia", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const rows = await listPenyedia();
  return c.html(
    page({
      title: "Penyedia",
      user,
      body: `<h1>Penyedia / rekanan</h1>
      <form class="card" method="post">
        <label>Nama</label><input name="nama" required>
        <label>NPWP</label><input name="npwp">
        <label>Alamat</label><textarea name="alamat"></textarea>
        <div class="actions"><button>Tambah</button></div>
      </form>
      <table><thead><tr><th>Nama</th><th>NPWP</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.nama}</td><td>${r.npwp ?? ""}</td></tr>`).join("")}</tbody></table>`,
    }),
  );
});

masterRoutes.post("/data-induk/penyedia", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createPenyedia(
    {
      nama: String(b.nama),
      npwp: String(b.npwp || "") || null,
      alamat: String(b.alamat || "") || null,
    },
    currentUser(c).id,
  );
  return c.redirect("/data-induk/penyedia");
});

masterRoutes.get("/data-induk/lembaga", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const rows = await listLembaga();
  return c.html(
    page({
      title: "Lembaga",
      user,
      body: `<h1>Lembaga penerima hibah</h1>
      <form class="card" method="post">
        <label>Nama</label><input name="nama" required>
        <label>Alamat</label><textarea name="alamat"></textarea>
        <div class="actions"><button>Tambah</button></div>
      </form>
      <table><thead><tr><th>Nama</th><th>Alamat</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.nama}</td><td>${r.alamat ?? ""}</td></tr>`).join("")}</tbody></table>`,
    }),
  );
});

masterRoutes.post("/data-induk/lembaga", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createLembaga(
    {
      nama: String(b.nama),
      alamat: String(b.alamat || "") || null,
    },
    currentUser(c).id,
  );
  return c.redirect("/data-induk/lembaga");
});

masterRoutes.get("/data-induk/konsultan", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const rows = await listKonsultan();
  return c.html(
    page({
      title: "Konsultan",
      user,
      body: `<h1>Konsultan pengawas / MK</h1>
      <form class="card" method="post">
        <label>Nama</label><input name="nama_konsultan" required>
        <label>Jenis</label><select name="jenis_konsultan"><option value="pengawas">Pengawas</option><option value="mk">Manajemen Konstruksi</option></select>
        <div class="actions"><button>Tambah</button></div>
      </form>
      <table><thead><tr><th>Nama</th><th>Jenis</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.nama_konsultan}</td><td>${r.jenis_konsultan}</td></tr>`).join("")}</tbody></table>`,
    }),
  );
});

masterRoutes.post("/data-induk/konsultan", async (c) => {
  if (!guard(c)) return c.redirect("/");
  const b = await c.req.parseBody();
  await createKonsultan(
    {
      nama_konsultan: String(b.nama_konsultan),
      jenis_konsultan: String(b.jenis_konsultan) as "pengawas" | "mk",
    },
    currentUser(c).id,
  );
  return c.redirect("/data-induk/konsultan");
});

masterRoutes.get("/data-induk/provinsi", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const rows = await listProvinsi();
  return c.html(
    page({
      title: "Provinsi",
      user,
      body: `<h1>Data master Provinsi</h1>
      <p class="muted">Data master tidak dapat diubah atau dihapus.</p>
      <table><thead><tr><th>No</th><th>Nama</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.provinsi_name}</td></tr>`).join("")}</tbody></table>
      <p><a class="btn ghost" href="/data-induk">Kembali</a></p>`,
    }),
  );
});

masterRoutes.get("/data-induk/kabupaten-kota", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const provinsi = await listProvinsi();
  const rows: { provinsi_name: string; kab_kota_provinsi_nama: string }[] = [];
  for (const p of provinsi) {
    const kab = await listKabKota(p.provinsi_id);
    for (const k of kab) {
      rows.push({
        provinsi_name: p.provinsi_name,
        kab_kota_provinsi_nama: k.kab_kota_provinsi_nama,
      });
    }
  }
  return c.html(
    page({
      title: "Kabupaten/Kota",
      user,
      body: `<h1>Data master Kabupaten/Kota</h1>
      <p class="muted">Data master tidak dapat diubah atau dihapus.</p>
      <table><thead><tr><th>No</th><th>Provinsi</th><th>Kabupaten/Kota</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.provinsi_name}</td><td>${r.kab_kota_provinsi_nama}</td></tr>`).join("")}</tbody></table>
      <p><a class="btn ghost" href="/data-induk">Kembali</a></p>`,
    }),
  );
});

masterRoutes.get("/data-induk/desa-kelurahan", async (c) => {
  const user = currentUser(c);
  if (!guard(c)) return c.redirect("/");
  const rows = await listDesaKelurahan();
  return c.html(
    page({
      title: "Desa/Kelurahan",
      user,
      body: `<h1>Data master Desa/Kelurahan</h1>
      <p class="muted">Data master tidak dapat diubah atau dihapus.</p>
      ${
        rows.length === 0
          ? `<p class="muted">Belum ada data desa/kelurahan pada master.</p>`
          : `<table><thead><tr><th>No</th><th>Desa/Kelurahan</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.desa_kelurahan_name}</td></tr>`).join("")}</tbody></table>`
      }
      <p><a class="btn ghost" href="/data-induk">Kembali</a></p>`,
    }),
  );
});

