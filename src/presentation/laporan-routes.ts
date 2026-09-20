import { Hono } from "hono";
import { currentUser, hasRole, money, num, page, requireUser } from "../kernel/index.js";
import {
  byKelompokBelanja,
  dashboard,
  exportCsv,
  petaTitik,
} from "../reporting/index.js";

export const laporanRoutes = new Hono();
laporanRoutes.use("/laporan", requireUser);
laporanRoutes.use("/laporan/*", requireUser);

laporanRoutes.get("/laporan", async (c) => {
  const user = currentUser(c);
  if (!hasRole(user, ["administrator", "kepala_bidang", "pimpinan"])) return c.redirect("/");
  const d = await dashboard(user);
  const kelompok = await byKelompokBelanja(user);
  return c.html(
    page({
      title: "Laporan",
      user,
      notice: c.req.query("ok"),
      error: c.req.query("err"),
      body: `<h1>Laporan RFK</h1>
      <div class="grid cols-4">
        <div class="stat"><span class="muted">Paket</span><b>${d.jumlahPaket}</b></div>
        <div class="stat"><span class="muted">Nilai</span><b class="money">${money(d.totalNilai)}</b></div>
        <div class="stat"><span class="muted">Fisik</span><b>${num(d.rataFisik)}%</b></div>
        <div class="stat"><span class="muted">Keuangan</span><b>${num(d.rataKeuangan)}%</b></div>
      </div>
      <p class="actions">
        <a class="btn" href="/laporan/peta">Peta lokasi</a>
        <a class="btn ghost" href="/laporan/kelompok">Menurut kelompok belanja</a>
        <a class="btn ghost" href="/laporan/ekspor.csv">Ekspor CSV (Excel)</a>
        <a class="btn ghost" href="/laporan/cetak">Cetak / PDF</a>
      </p>
      ${
        user.role === "kepala_bidang"
          ? `<div class="card">
              <h2>Impor CSV</h2>
              <p class="muted">Impor sementara nonaktif — lengkapi data induk dulu (jenis belanja, sumber dana, metode PBJ, jenis kontrak).</p>
            </div>`
          : ""
      }
      <div class="card">
        <h2>Ringkasan kelompok</h2>
        <table><thead><tr><th>Kode</th><th>Kelompok</th><th>Paket</th><th class="money">Nilai</th></tr></thead>
        <tbody>${kelompok.map((g) => `<tr><td>${g.kode}</td><td>${g.nama}</td><td>${g.paket}</td><td class="money">${money(g.nilai)}</td></tr>`).join("")}</tbody></table>
      </div>`,
    }),
  );
});

laporanRoutes.get("/laporan/kelompok", async (c) => {
  const user = currentUser(c);
  if (!hasRole(user, ["administrator", "kepala_bidang", "pimpinan"])) return c.redirect("/");
  const kelompok = await byKelompokBelanja(user);
  return c.html(
    page({
      title: "Kelompok belanja",
      user,
      body: `<h1>Laporan menurut kelompok belanja</h1>
      <table><thead><tr><th>Kode</th><th>Nama</th><th>Paket</th><th class="money">Nilai kontrak</th></tr></thead>
      <tbody>${kelompok.map((g) => `<tr><td>${g.kode}</td><td>${g.nama}</td><td>${g.paket}</td><td class="money">${money(g.nilai)}</td></tr>`).join("")}</tbody></table>
      <p><a class="btn ghost" href="/laporan">Kembali</a></p>`,
    }),
  );
});

laporanRoutes.get("/laporan/peta", async (c) => {
  const user = currentUser(c);
  if (!hasRole(user, ["administrator", "kepala_bidang", "pimpinan"])) return c.redirect("/");
  const titik = await petaTitik(user);
  const withCoords = titik.filter((t) => t.lat != null && t.lng != null);
  const data = JSON.stringify(
    withCoords.map((t) => ({
      nama: t.nama_paket,
      nomor: t.nomor_kontrak,
      lokasi: t.lokasi_nama,
      lat: t.lat,
      lng: t.lng,
      id: t.id,
    })),
  );
  const tableRows =
    titik
      .map(
        (t) =>
          `<tr><td><a href="/rfk/${t.id}">${t.nama_paket}</a></td><td>${t.nomor_kontrak}</td><td>${t.lokasi_nama ?? "—"}</td><td>${t.lokasi_kab_kota ?? ""}</td><td>${t.lokasi_desa_kelurahan ?? ""}</td></tr>`,
      )
      .join("") || `<tr><td colspan="5">Belum ada lokasi paket.</td></tr>`;

  return c.html(
    page({
      title: "Peta lokasi",
      user,
      body: `<h1>Peta lokasi paket</h1>
      ${
        withCoords.length === 0
          ? `<p class="muted">Koordinat peta tidak tersedia pada skema lokasi saat ini. Daftar nama lokasi ditampilkan di bawah.</p>
             <table><thead><tr><th>Paket</th><th>Nomor</th><th>Lokasi</th><th>Kab/Kota</th><th>Desa/Kelurahan</th></tr></thead>
             <tbody>${tableRows}</tbody></table>`
          : `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
      <div id="peta" class="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const titik = ${data};
        const peta = L.map('peta').setView([-3.72, 137.98], 9);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OSM' }).addTo(peta);
        for (const t of titik) {
          if (t.lat == null || t.lng == null) continue;
          L.marker([t.lat, t.lng]).addTo(peta).bindPopup(
            '<a href="/rfk/' + t.id + '">' + t.nama + '</a><br>' + t.nomor + '<br>' + t.lokasi
          );
        }
      </script>`
      }
      <p><a class="btn ghost" href="/laporan">Kembali</a></p>`,
    }),
  );
});

laporanRoutes.get("/laporan/ekspor.csv", async (c) => {
  const user = currentUser(c);
  if (!hasRole(user, ["administrator", "kepala_bidang", "pimpinan"])) return c.redirect("/");
  const csv = await exportCsv(user);
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=laporan-rfk.csv",
  });
});

laporanRoutes.get("/laporan/cetak", async (c) => {
  const user = currentUser(c);
  if (!hasRole(user, ["administrator", "kepala_bidang", "pimpinan"])) return c.redirect("/");
  const d = await dashboard(user);
  const kelompok = await byKelompokBelanja(user);
  return c.html(
    page({
      title: "Cetak laporan",
      user,
      body: `<h1>Laporan resmi RFK</h1>
      <p>Pilih Cetak pada peramban, lalu simpan sebagai PDF.</p>
      <p>Jumlah paket: <b>${d.jumlahPaket}</b> · Nilai: <b class="money">${money(d.totalNilai)}</b></p>
      <table><thead><tr><th>Kode</th><th>Kelompok</th><th>Paket</th><th class="money">Nilai</th></tr></thead>
      <tbody>${kelompok.map((g) => `<tr><td>${g.kode}</td><td>${g.nama}</td><td>${g.paket}</td><td class="money">${money(g.nilai)}</td></tr>`).join("")}</tbody></table>
      <p class="actions"><button onclick="window.print()">Cetak / PDF</button></p>`,
    }),
  );
});

laporanRoutes.post("/laporan/impor", async (c) => {
  const user = currentUser(c);
  if (user.role !== "kepala_bidang" || !user.bidang_id) return c.redirect("/laporan");
  return c.redirect(
    `/laporan?err=${encodeURIComponent("Impor sementara nonaktif — lengkapi data induk dulu")}`,
  );
});

