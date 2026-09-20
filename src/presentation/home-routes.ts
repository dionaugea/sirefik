import { Hono } from "hono";
import { currentUser, escapeHtml, page, requireUser } from "../kernel/index.js";
import { getEntitas } from "../organization/index.js";
import { dashboard } from "../reporting/index.js";
import { petunjukRoutes } from "./auth-routes.js";

export const homeRoutes = new Hono();
homeRoutes.route("/", petunjukRoutes);

const DEFAULT_LOGO = "/aset/logo-entitas-default.svg";

function logoEntitasSrc(file: string | null | undefined): string {
  const name = (file ?? "").trim();
  if (!name) return DEFAULT_LOGO;
  return `/aset/unggahan/${encodeURIComponent(name)}`;
}

/** Dummy data grafik dashboard (CRITICAL-ISSUE-7). */
const DUMMY = {
  bulan: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
  fisik: [12, 18, 24, 31, 38, 45, 52, 58, 64, 71, 78, 85],
  keuangan: [10, 16, 22, 28, 35, 42, 49, 55, 61, 68, 74, 82],
  bidang: ["Sekretariat", "Bina Marga", "Cipta Karya", "Tata Ruang", "SDA"],
  nilaiBidang: [4.2, 12.8, 9.5, 3.1, 7.6],
  status: ["Draft", "Diverifikasi", "Divalidasi", "Dikonsolidasi", "Disetujui"],
  statusCount: [8, 14, 11, 6, 21],
  trenPaket: [5, 7, 6, 9, 8, 11, 10, 12, 9, 13, 12, 15],
};

homeRoutes.get("/", requireUser, async (c) => {
  const user = currentUser(c);
  const entitas = await getEntitas();
  const d = await dashboard(user).catch(() => null);

  const jumlahPaket = d?.jumlahPaket ?? 42;
  const totalNilai = d?.totalNilai ?? 37_200_000_000;
  const rataFisik = d?.rataFisik ?? 68.5;
  const rataKeuangan = d?.rataKeuangan ?? 64.2;

  const logoSrc = logoEntitasSrc(entitas?.file_logo_entitas);
  const namaEntitas = escapeHtml(entitas?.entitas_name ?? "—");
  const namaProvinsi = escapeHtml(entitas?.provinsi ?? "");

  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script>
(function () {
  var dummy = ${JSON.stringify(DUMMY)};
  var pine = "#1f4d3a";
  var pine2 = "#2d6a50";
  var gold = "#c4a35a";
  var muted = "#6d6458";

  function tip(ctx) {
    return { backgroundColor: "#1c1914", titleColor: "#f7f1e4", bodyColor: "#f7f1e4", padding: 10 };
  }

  var lineEl = document.getElementById("chart-realisasi");
  if (lineEl) {
    new Chart(lineEl, {
      type: "line",
      data: {
        labels: dummy.bulan,
        datasets: [
          { label: "Fisik (%)", data: dummy.fisik, borderColor: pine2, backgroundColor: "rgba(45,106,80,0.12)", fill: true, tension: 0.35 },
          { label: "Keuangan (%)", data: dummy.keuangan, borderColor: gold, backgroundColor: "rgba(196,163,90,0.12)", fill: true, tension: 0.35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" }, tooltip: tip() },
        scales: { y: { min: 0, max: 100, ticks: { callback: function (v) { return v + "%"; } } } }
      }
    });
  }

  var barEl = document.getElementById("chart-bidang");
  if (barEl) {
    new Chart(barEl, {
      type: "bar",
      data: {
        labels: dummy.bidang,
        datasets: [{
          label: "Nilai kontrak (Miliar Rp)",
          data: dummy.nilaiBidang,
          backgroundColor: [pine, pine2, gold, "#8a7340", "#3d7a5c"],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tip() },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  var donutEl = document.getElementById("chart-status");
  if (donutEl) {
    new Chart(donutEl, {
      type: "doughnut",
      data: {
        labels: dummy.status,
        datasets: [{
          data: dummy.statusCount,
          backgroundColor: ["#b8a78a", "#5a8f74", "#2d6a50", "#c4a35a", "#1f4d3a"],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "58%",
        plugins: { legend: { position: "bottom" }, tooltip: tip() }
      }
    });
  }

  var trenEl = document.getElementById("chart-paket");
  if (trenEl) {
    new Chart(trenEl, {
      type: "bar",
      data: {
        labels: dummy.bulan,
        datasets: [{
          label: "Paket baru",
          data: dummy.trenPaket,
          backgroundColor: "rgba(31,77,58,0.75)",
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tip() },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 2 } } }
      }
    });
  }

  document.querySelectorAll("[data-kpi]").forEach(function (el) {
    var target = Number(el.getAttribute("data-kpi") || "0");
    var suffix = el.getAttribute("data-suffix") || "";
    var prefix = el.getAttribute("data-prefix") || "";
    var isMoney = el.getAttribute("data-money") === "1";
    var start = null;
    var dur = 900;
    function formatRp(n) {
      var v = Number(n);
      if (!isFinite(v)) v = 0;
      var neg = v < 0;
      var parts = Math.abs(v).toFixed(2).split(".");
      var grouped = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
      return (neg ? "-" : "") + "Rp" + grouped + "," + parts[1];
    }
    function fmt(n) {
      if (isMoney) return formatRp(n);
      return prefix + new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n) + suffix;
    }
    function tick(ts) {
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * eased);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
</script>`;

  return c.html(
    page({
      title: "Dashboard",
      user,
      path: "/",
      scripts,
      body: `<header class="entitas-heading dash-head">
        <img
          class="entitas-logo"
          src="${escapeHtml(logoSrc)}"
          alt="Logo Pemerintah Daerah ${namaEntitas}"
          width="72"
          height="72"
          onerror="this.onerror=null;this.src='${DEFAULT_LOGO}'"
        >
        <div class="entitas-heading-text">
          <p class="eyebrow">Dashboard SIREFIK</p>
          <h1>Pemerintah Daerah ${namaEntitas}</h1>
          <p class="lead">Provinsi ${namaProvinsi}</p>
        </div>
      </header>

      <section class="kpi-grid">
        <article class="kpi-card">
          <span class="muted">Paket pekerjaan</span>
          <b data-kpi="${jumlahPaket}">0</b>
        </article>
        <article class="kpi-card">
          <span class="muted">Nilai kontrak</span>
          <b class="money" data-kpi="${totalNilai}" data-money="1">Rp0,00</b>
        </article>
        <article class="kpi-card">
          <span class="muted">Rata-rata fisik</span>
          <b data-kpi="${rataFisik}" data-suffix="%">0%</b>
        </article>
        <article class="kpi-card">
          <span class="muted">Rata-rata keuangan</span>
          <b data-kpi="${rataKeuangan}" data-suffix="%">0%</b>
        </article>
      </section>

      <section class="dash-grid">
        <article class="dash-panel dash-wide">
          <div class="dash-panel-head">
            <h2>Tren realisasi fisik &amp; keuangan</h2>
            <p class="muted">Data contoh per bulan (dummy)</p>
          </div>
          <div class="chart-box"><canvas id="chart-realisasi"></canvas></div>
        </article>
        <article class="dash-panel">
          <div class="dash-panel-head">
            <h2>Nilai kontrak per bidang</h2>
            <p class="muted">Miliar rupiah (dummy)</p>
          </div>
          <div class="chart-box"><canvas id="chart-bidang"></canvas></div>
        </article>
        <article class="dash-panel">
          <div class="dash-panel-head">
            <h2>Status verval paket</h2>
            <p class="muted">Sebaran status (dummy)</p>
          </div>
          <div class="chart-box chart-box-sm"><canvas id="chart-status"></canvas></div>
        </article>
        <article class="dash-panel dash-wide">
          <div class="dash-panel-head">
            <h2>Paket baru per bulan</h2>
            <p class="muted">Volume input transaksi (dummy)</p>
          </div>
          <div class="chart-box"><canvas id="chart-paket"></canvas></div>
        </article>
      </section>

      <section class="dash-quick">
        <h2>Akses cepat</h2>
        <div class="quick-grid">
          <a class="quick-card" href="/rfk"><strong>Realisasi Fisik Keuangan</strong><span>Kelola paket &amp; kontrak</span></a>
          <a class="quick-card" href="/laporan"><strong>Laporan RFK</strong><span>Ringkasan &amp; ekspor</span></a>
          <a class="quick-card" href="/data-induk/sumber-dana"><strong>Data Induk</strong><span>Sumber dana &amp; katalog</span></a>
          <a class="quick-card" href="/kontrak/pembayaran"><strong>Pembayaran</strong><span>Termin kontrak</span></a>
        </div>
      </section>`,
    }),
  );
});
