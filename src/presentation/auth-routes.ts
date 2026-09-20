import { Hono } from "hono";
import {
  clearSession,
  currentUser,
  page,
  requireUser,
  setSession,
} from "../kernel/index.js";
import { login } from "../identity/index.js";
import { getEntitas } from "../organization/index.js";

export const authRoutes = new Hono();

authRoutes.get("/masuk", async (c) => {
  return c.html(
    page({
      title: "Masuk",
      notice: c.req.query("ok"),
      error: c.req.query("err"),
      body: `<div class="login card">
        <h1>Masuk</h1>
        <p class="lead">Gunakan akun yang didaftarkan pada saat instalasi.</p>
        <form method="post" action="/masuk">
          <label>Nama pengguna</label>
          <input name="username" required autocomplete="username">
          <label>Kata sandi</label>
          <input name="password" type="password" required autocomplete="current-password">
          <div class="actions"><button type="submit">Masuk</button></div>
        </form>
      </div>`,
    }),
  );
});

authRoutes.post("/masuk", async (c) => {
  const body = await c.req.parseBody();
  const user = await login(String(body.username ?? ""), String(body.password ?? ""));
  if (!user) {
    return c.html(
      page({
        title: "Masuk",
        error: "Nama pengguna atau kata sandi salah.",
        body: `<div class="login card"><p><a href="/masuk">Coba lagi</a></p></div>`,
      }),
    );
  }
  setSession(c, user.id);
  return c.redirect("/");
});

authRoutes.get("/keluar", (c) => {
  clearSession(c);
  return c.redirect("/masuk");
});

export const petunjukRoutes = new Hono();

petunjukRoutes.get("/petunjuk", requireUser, async (c) => {
  const user = currentUser(c);
  const entitas = await getEntitas();
  return c.html(
    page({
      title: "Petunjuk",
      user,
      body: `<h1>Petunjuk</h1>
      <p class="lead">${entitas?.entitas_name ?? "SIREFIK"} — alur kerja realisasi fisik dan keuangan.</p>
      <div class="card">
        <ol>
          <li>Administrator sistem mengisi entitas, OPD, bidang, pengguna, dan data induk.</li>
          <li>Staf bidang mencatat paket/kontrak di tingkat bidang, addendum, pembayaran, STS, prestasi fisik, PHO/BAST, dan bukti.</li>
          <li>Verval berjenjang: Staf Bidang → Kepala Bidang → Konsolidasi Sekretariat → Pimpinan OPD.</li>
          <li>Kepala bidang dan pimpinan membuka laporan, peta, dan ekspor/impor.</li>
        </ol>
        <p class="muted">Akun dibuat pada saat pendaftaran awal. Hubungi administrator jika lupa kata sandi.</p>
      </div>`,
    }),
  );
});
