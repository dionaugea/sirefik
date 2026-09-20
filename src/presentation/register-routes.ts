import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Hono } from "hono";
import { escapeHtml, page, roleLabel, uploadsDir } from "../kernel/index.js";
import type { Role } from "../kernel/tables.js";
import {
  countBidang,
  getEntitas,
  listBidang,
  listKabKota,
  listOpd,
  listProvinsi,
} from "../organization/index.js";
import { getUserById, listUsers } from "../identity/index.js";
import {
  acceptTerms,
  countOpd,
  missingUserRoles,
  phasePath,
  saveBidang,
  saveEntitas,
  saveOpd,
  saveUser,
  updateRegisteredUser,
  type RegistrationPhase,
} from "../setup/index.js";

export const registerRoutes = new Hono();

const STEPS: { id: RegistrationPhase; label: string }[] = [
  { id: "entitas", label: "Entitas" },
  { id: "opd", label: "OPD" },
  { id: "bidang", label: "Bidang" },
  { id: "pengguna", label: "Pengguna" },
  { id: "ketentuan", label: "Ketentuan" },
];

export function landingPage(): string {
  return page({
    title: "Selamat datang",
    bodyClass: "landing",
    body: `<section class="hero">
      <div class="hero-card">
        <span class="mark hero-mark">SF</span>
        <h1>SIREFIK</h1>
        <p>Aplikasi Sistem Informasi Realisasi Fisik dan Keuangan untuk Pemerintah Daerah.</p>
        <a class="btn btn-register" href="/daftar">Registrasi Pemerintah Daerah</a>
      </div>
    </section>`,
  });
}

function wizard(opts: {
  phase: RegistrationPhase;
  title: string;
  body: string;
  error?: string;
}): string {
  const idx = STEPS.findIndex((s) => s.id === opts.phase);
  const percent =
    STEPS.length <= 1
      ? 100
      : Math.round((idx / (STEPS.length - 1)) * 100);
  const steps = STEPS.map((s, i) => {
    const state = i < idx ? "done" : i === idx ? "current" : "";
    return `<li class="${state}"><span class="n">${i + 1}</span>${s.label}</li>`;
  }).join("");
  return page({
    title: opts.title,
    error: opts.error,
    body: `<div class="wizard">
      <h1>Registrasi Awal Aplikasi SIREFIK</h1>
      <p class="lead">Isi data entitas, OPD, bidang, dan administrator sistem sebelum memakai aplikasi.</p>
      <ol class="steps">${steps}</ol>
      <div class="reg-progress" aria-label="Progres registrasi ${percent} persen">
        <div class="reg-progress-meta">
          <span>Progres pengisian</span>
          <strong class="reg-progress-pct" data-target="${percent}">0%</strong>
        </div>
        <div class="reg-progress-track">
          <div class="reg-progress-fill" style="--reg-pct:${percent}%"></div>
        </div>
      </div>
      <div class="phase">${opts.body}</div>
      <script>
        (function () {
          var el = document.querySelector(".reg-progress-pct");
          var fill = document.querySelector(".reg-progress-fill");
          if (!el || !fill) return;
          var target = Number(el.getAttribute("data-target") || "0");
          requestAnimationFrame(function () { fill.classList.add("animate"); });
          var start = null;
          var from = 0;
          var dur = 700;
          function tick(ts) {
            if (start == null) start = ts;
            var t = Math.min(1, (ts - start) / dur);
            var eased = 1 - Math.pow(1 - t, 3);
            var n = Math.round(from + (target - from) * eased);
            el.textContent = n + "%";
            if (t < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        })();
      </script>
    </div>`,
  });
}

async function requirePhase(wanted: RegistrationPhase): Promise<string | null> {
  if (wanted === "entitas") return null;
  if (!(await getEntitas())) return "/daftar/entitas";
  if (wanted === "opd") return null;
  if ((await countOpd()) === 0) return "/daftar/opd";
  if (wanted === "bidang") return null;
  if ((await countBidang()) === 0) return "/daftar/bidang";
  if (wanted === "pengguna") return null;
  if ((await missingUserRoles()).length > 0) return "/daftar/pengguna";
  return null;
}

registerRoutes.get("/daftar", async (c) => c.redirect(await phasePath()));

registerRoutes.get("/daftar/entitas", async (c) => {
  const skip = await requirePhase("entitas");
  if (skip) return c.redirect(skip);
  const [e, provinces] = await Promise.all([getEntitas(), listProvinsi()]);
  const provinceOpts = [
    `<option value="">Pilih Provinsi</option>`,
    ...provinces.map((p) => {
      const sel = e?.id_provinsi === p.provinsi_id ? " selected" : "";
      return `<option value="${p.provinsi_id}"${sel}>${escapeHtml(p.provinsi_name)}</option>`;
    }),
  ].join("");
  const kabByProv: Record<number, { id: number; nama: string }[]> = {};
  for (const p of provinces) {
    const kabs = await listKabKota(p.provinsi_id);
    kabByProv[p.provinsi_id] = kabs.map((k) => ({
      id: k.kab_kota_provinsi_id,
      nama: k.kab_kota_provinsi_nama,
    }));
  }
  return c.html(
    wizard({
      phase: "entitas",
      title: "Data Entitas Pemerintah Daerah",
      error: c.req.query("err"),
      body: `<form class="card" method="post" action="/daftar/entitas" enctype="multipart/form-data">
        <h2>Data Entitas Pemerintah Daerah</h2>
        <div class="grid cols-2">
          <div>
            <label>Provinsi</label>
            <select name="id_provinsi" id="provinsi" required>${provinceOpts}</select>
          </div>
          <div>
            <label>Kabupaten/Kota</label>
            <select name="kab_kota_id" id="regency" required>
              <option value="">Pilih kabupaten/kota</option>
            </select>
          </div>
          <div><label>Tahun Berdiri</label><input name="tahun_berdiri" type="number" min="1800" max="2100" value="${e?.tahun_berdiri ?? ""}" required></div>
          <div><label>Logo Entitas</label><input name="file_logo_entitas" type="file" accept="image/*"></div>
        </div>
        <div class="actions"><button>Selanjutnya</button></div>
      </form>
      <script>
        (function () {
          var regions = ${JSON.stringify(kabByProv)};
          var selected = ${JSON.stringify(e?.entitas_name ?? "")};
          var sel = document.getElementById("provinsi");
          var reg = document.getElementById("regency");
          function fill(keep) {
            var list = regions[sel.value] || [];
            var html = '<option value="">Pilih kabupaten/kota</option>';
            for (var i = 0; i < list.length; i++) {
              var item = list[i];
              var selAttr = item.nama === keep ? " selected" : "";
              html += '<option value="' + item.id + '"' + selAttr + ">" + item.nama + "</option>";
            }
            reg.innerHTML = html;
          }
          sel.addEventListener("change", function () { selected = ""; fill(""); });
          fill(selected);
        })();
      </script>`,
    }),
  );
});

registerRoutes.post("/daftar/entitas", async (c) => {
  const skip = await requirePhase("entitas");
  if (skip) return c.redirect(skip);
  try {
    const b = await c.req.parseBody();
    const id_provinsi = Number(b.id_provinsi);
    const kab_kota_id = Number(b.kab_kota_id);
    const tahun_berdiri = Number(b.tahun_berdiri);
    if (!id_provinsi || !kab_kota_id || !Number.isFinite(tahun_berdiri)) {
      throw new Error("Provinsi, kabupaten/kota, dan tahun berdiri wajib diisi.");
    }
    const existing = await getEntitas();
    let logo = existing?.file_logo_entitas ?? null;
    const file = b.file_logo_entitas;
    if (file instanceof File && file.size > 0) {
      const ext = extname(file.name) || ".png";
      logo = `logo-${randomUUID()}${ext}`;
      await writeFile(join(uploadsDir(), logo), Buffer.from(await file.arrayBuffer()));
    }
    await saveEntitas({
      id_provinsi,
      kab_kota_id,
      tahun_berdiri,
      file_logo_entitas: logo,
    });
    return c.redirect("/daftar/opd");
  } catch (e) {
    return c.redirect(`/daftar/entitas?err=${encodeURIComponent((e as Error).message)}`);
  }
});

registerRoutes.get("/daftar/opd", async (c) => {
  const skip = await requirePhase("opd");
  if (skip) return c.redirect(skip);
  const existing = (await listOpd())[0];
  return c.html(
    wizard({
      phase: "opd",
      title: "Data Perangkat Daerah",
      error: c.req.query("err"),
      body: `<form class="card" method="post" action="/daftar/opd">
        <h2>Data Perangkat Daerah</h2>
        <p class="muted">ID OPD diisi otomatis oleh sistem.</p>
        <div class="grid cols-2">
          <div><label>Nama OPD</label><input name="nama_opd" value="${escapeHtml(existing?.opd_name ?? "")}" required></div>
          <div><label>Tugas dan fungsi</label><textarea name="tugas_fungsi">${escapeHtml(existing?.tugas_fungsi ?? "")}</textarea></div>
          <div><label>Alamat kantor</label><textarea name="alamat_kantor">${escapeHtml(existing?.alamat_kantor ?? "")}</textarea></div>
          <div><label>Nomor telepon</label><input name="no_telp" value="${escapeHtml(existing?.no_telp ?? "")}"></div>
          <div><label>Email</label><input name="email" type="email" value="${escapeHtml(existing?.email ?? "")}"></div>
        </div>
        <div class="actions">
          <a class="btn ghost" href="/daftar/entitas">Sebelumnya</a>
          <button>Selanjutnya</button>
        </div>
      </form>`,
    }),
  );
});

registerRoutes.post("/daftar/opd", async (c) => {
  const skip = await requirePhase("opd");
  if (skip) return c.redirect(skip);
  try {
    const b = await c.req.parseBody();
    const nama_opd = String(b.nama_opd ?? "").trim();
    if (!nama_opd) throw new Error("Nama OPD wajib diisi.");
    await saveOpd({
      nama_opd,
      tugas_fungsi: String(b.tugas_fungsi || "") || null,
      alamat_kantor: String(b.alamat_kantor || "") || null,
      no_telp: String(b.no_telp || "") || null,
      email: String(b.email || "") || null,
    });
    return c.redirect("/daftar/bidang");
  } catch (e) {
    return c.redirect(`/daftar/opd?err=${encodeURIComponent((e as Error).message)}`);
  }
});

registerRoutes.get("/daftar/bidang", async (c) => {
  const skip = await requirePhase("bidang");
  if (skip) return c.redirect(skip);
  const rows = await listBidang();
  const table =
    rows.length === 0
      ? `<p class="muted">Belum ada bidang. Tambahkan minimal satu bidang (disarankan termasuk Sekretariat).</p>`
      : `<table>
          <thead><tr><th>No</th><th>Nama</th><th>Fungsi</th></tr></thead>
          <tbody>${rows
            .map(
              (r, i) =>
                `<tr><td>${i + 1}</td><td>${escapeHtml(r.bidang_name)}</td><td>${escapeHtml(r.bidang_fungsi)}</td></tr>`,
            )
            .join("")}</tbody>
        </table>`;
  const dapatLanjut = rows.length >= 1;
  const lanjut = dapatLanjut
    ? `<form method="post" action="/daftar/bidang/lanjut" class="actions-form">
         <button type="submit">Selanjutnya</button>
       </form>`
    : `<button type="button" disabled title="Minimal satu bidang wajib diisi">Selanjutnya</button>`;
  const hint = dapatLanjut
    ? ""
    : `<p class="muted">Minimal satu bidang wajib diisi sebelum dapat melanjutkan.</p>`;
  return c.html(
    wizard({
      phase: "bidang",
      title: "Data Bidang",
      error: c.req.query("err"),
      body: `<form class="card" method="post" action="/daftar/bidang">
        <h2>Data Bidang</h2>
        <p class="muted">Bidang adalah sub unit pada OPD. Bidang bernama Sekretariat dapat mengonsolidasi laporan RFK tingkat OPD. ID bidang diisi otomatis.</p>
        <div class="grid cols-2">
          <div><label>Nama bidang</label><input name="bidang_name" required placeholder="mis. Sekretariat"></div>
          <div><label>Fungsi bidang</label><input name="bidang_fungsi" required placeholder="Uraian singkat"></div>
        </div>
        <div class="actions"><button name="aksi" value="tambah">Tambah bidang</button></div>
      </form>
      ${table}
      <div class="actions">
        <a class="btn ghost" href="/daftar/opd">Sebelumnya</a>
        ${lanjut}
      </div>
      ${hint}`,
    }),
  );
});

registerRoutes.post("/daftar/bidang", async (c) => {
  const skip = await requirePhase("bidang");
  if (skip) return c.redirect(skip);
  try {
    const b = await c.req.parseBody();
    await saveBidang({
      bidang_name: String(b.bidang_name ?? "").trim(),
      bidang_fungsi: String(b.bidang_fungsi ?? "").trim(),
    });
    return c.redirect("/daftar/bidang");
  } catch (e) {
    return c.redirect(`/daftar/bidang?err=${encodeURIComponent((e as Error).message)}`);
  }
});

registerRoutes.post("/daftar/bidang/lanjut", async (c) => {
  const skip = await requirePhase("bidang");
  if (skip) return c.redirect(skip);
  if ((await countBidang()) < 1) {
    return c.redirect(
      `/daftar/bidang?err=${encodeURIComponent("Minimal satu bidang wajib diisi sebelum melanjutkan.")}`,
    );
  }
  return c.redirect("/daftar/pengguna");
});

function userForm(opts: {
  jenis: Role;
  bidangOptions: string;
  existing?: Awaited<ReturnType<typeof getUserById>>;
}): string {
  const e = opts.existing;
  const editing = Boolean(e);
  return `<form class="card" method="post" action="/daftar/pengguna">
    <h2>${roleLabel(opts.jenis)}${editing ? " — ubah" : ""}</h2>
    <input type="hidden" name="role" value="${opts.jenis}">
    ${editing ? `<input type="hidden" name="user_id" value="${e!.id}">` : ""}
    <div class="grid cols-2">
      <div><label>Nama</label><input name="nama" value="${escapeHtml(e?.nama_lengkap ?? "")}" required></div>
      <div><label>NIP</label><input name="nip" inputmode="numeric" pattern="[0-9]{18,}" minlength="18" value="${escapeHtml(e?.nip ?? "")}" required></div>
      <div><label>Jabatan</label><input name="jabatan" value="${escapeHtml(e?.jabatan ?? "")}"></div>
      <div><label>Bidang</label><select name="bidang_id" required>${opts.bidangOptions}</select></div>
      <div><label>Nomor Telepon</label><input name="no_telp" value="${escapeHtml(e?.no_telp ?? "")}"></div>
      <div><label>Email</label><input name="email" type="email" value="${escapeHtml(e?.email ?? "")}"></div>
      <div><label>Nama Pengguna</label><input name="username" value="${escapeHtml(e?.username ?? "")}" required autocomplete="off"></div>
      <div><label>Kata Sandi${editing ? " (kosongkan jika tidak diubah)" : ""}</label><input name="password" type="password" ${editing ? "" : "required "}autocomplete="new-password"></div>
    </div>
    <div class="actions"><button>${editing ? "Simpan perubahan" : `Simpan ${roleLabel(opts.jenis)}`}</button></div>
  </form>`;
}

registerRoutes.get("/daftar/pengguna", async (c) => {
  const skip = await requirePhase("pengguna");
  if (skip) return c.redirect(skip);
  const [users, bidang, missing] = await Promise.all([
    listUsers(),
    listBidang(),
    missingUserRoles(),
  ]);
  const ubahId = Number(c.req.query("ubah") ?? 0);
  const editing =
    missing.length === 0 && ubahId ? await getUserById(ubahId) : undefined;

  function bidangOptions(selected?: number) {
    return bidang
      .map((b) => {
        const sel = selected === b.id ? " selected" : "";
        return `<option value="${b.id}"${sel}>${escapeHtml(b.bidang_name)}</option>`;
      })
      .join("");
  }

  let forms = "";
  if (editing && editing.role === "administrator") {
    forms = userForm({
      jenis: "administrator",
      bidangOptions: bidangOptions(editing.bidang_id),
      existing: editing,
    });
  } else if (missing.length > 0) {
    forms = userForm({ jenis: "administrator", bidangOptions: bidangOptions() });
  }

  const ubahCol = missing.length === 0;
  const table =
    users.length === 0
      ? `<p class="muted">Belum ada pengguna.</p>`
      : `<table>
          <thead><tr><th>No</th><th>Nama</th><th>Jenis</th><th>Bidang</th><th>OPD</th><th>Pengguna</th>${ubahCol ? "<th></th>" : ""}</tr></thead>
          <tbody>${users
            .map((u, i) => {
              const ubah = ubahCol
                ? `<td><a class="btn ghost" href="/daftar/pengguna?ubah=${u.id}">Ubah</a></td>`
                : "";
              return `<tr>
                <td>${i + 1}</td>
                <td>${escapeHtml(u.nama)}</td>
                <td>${roleLabel(u.role)}</td>
                <td>${escapeHtml(u.bidang_nama ?? "")}</td>
                <td>${escapeHtml(u.opd_nama)}</td>
                <td>${escapeHtml(u.username)}</td>
                ${ubah}
              </tr>`;
            })
            .join("")}</tbody>
        </table>`;
  const lanjut =
    missing.length === 0 && !editing
      ? `<p class="actions"><a class="btn" href="/daftar/ketentuan">Selanjutnya</a></p>`
      : missing.length > 0
        ? `<p class="muted">Pada registrasi cukup mendaftarkan administrator sistem. Pengguna bidang dan pimpinan ditambahkan kemudian melalui Data Induk.</p>`
        : "";
  return c.html(
    wizard({
      phase: "pengguna",
      title: "Data pengguna",
      error: c.req.query("err"),
      body: `${forms}${table}
        <div class="actions"><a class="btn ghost" href="/daftar/bidang">Sebelumnya</a></div>
        ${lanjut}`,
    }),
  );
});

registerRoutes.post("/daftar/pengguna", async (c) => {
  const skip = await requirePhase("pengguna");
  if (skip) return c.redirect(skip);
  try {
    const b = await c.req.parseBody();
    if (String(b.role) !== "administrator") {
      throw new Error("Pada registrasi hanya administrator sistem yang diizinkan.");
    }
    const userId = Number(b.user_id ?? 0);
    const payload = {
      nama: String(b.nama ?? "").trim(),
      nip: String(b.nip || "") || null,
      jabatan: String(b.jabatan || "") || null,
      bidang_id: Number(b.bidang_id),
      no_telp: String(b.no_telp || "") || null,
      email: String(b.email || "") || null,
      username: String(b.username ?? "").trim(),
      password: String(b.password ?? ""),
    };
    if (userId) await updateRegisteredUser({ id: userId, ...payload });
    else await saveUser({ ...payload, role: "administrator" });
    return c.redirect("/daftar/pengguna");
  } catch (e) {
    return c.redirect(`/daftar/pengguna?err=${encodeURIComponent((e as Error).message)}`);
  }
});

registerRoutes.get("/daftar/ketentuan", async (c) => {
  const skip = await requirePhase("ketentuan");
  if (skip) return c.redirect(skip);
  return c.html(
    wizard({
      phase: "ketentuan",
      title: "Persetujuan Syarat dan Ketentuan",
      error: c.req.query("err"),
      body: `<form class="card terms" method="post" action="/daftar/ketentuan">
        <h2>Persetujuan Syarat dan Ketentuan</h2>
        <div class="terms-box">
          <p>Dengan menggunakan SIREFIK, Anda menyatakan bahwa:</p>
          <ol>
            <li>Data entitas, OPD, bidang, dan pengguna yang diisi adalah benar dan menjadi tanggung jawab pemerintah daerah.</li>
            <li>Aplikasi ini hanya untuk keperluan resmi pencatatan realisasi fisik dan keuangan.</li>
            <li>Aplikasi tidak boleh disalin, diedarkan, atau didistribusikan secara ilegal kepada pihak yang tidak berwenang.</li>
            <li>Penyalahgunaan, pembocoran data, atau distribusi tanpa izin dapat dikenai sanksi sesuai peraturan.</li>
          </ol>
        </div>
        <label class="check">
          <input type="checkbox" name="setuju" value="1" required>
          <span>Saya telah membaca dan menyetujui syarat dan ketentuan di atas.</span>
        </label>
        <div class="actions">
          <a class="btn ghost" href="/daftar/pengguna">Sebelumnya</a>
          <button type="submit">Setujui dan masuk</button>
        </div>
      </form>`,
    }),
  );
});

registerRoutes.post("/daftar/ketentuan", async (c) => {
  const skip = await requirePhase("ketentuan");
  if (skip) return c.redirect(skip);
  try {
    const b = await c.req.parseBody();
    if (String(b.setuju) !== "1") {
      throw new Error("Anda harus menyetujui syarat dan ketentuan.");
    }
    await acceptTerms();
    return c.redirect("/masuk?ok=" + encodeURIComponent("Pendaftaran selesai. Silakan masuk."));
  } catch (e) {
    return c.redirect(`/daftar/ketentuan?err=${encodeURIComponent((e as Error).message)}`);
  }
});
