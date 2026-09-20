import { html, raw } from "hono/html";
import type { AuthUser } from "./auth.js";
import { roleLabel } from "./auth.js";
import type { Role } from "./tables.js";

type NavLeaf = { href: string; label: string };
type NavGroup = { label: string; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

/** Menu navigasi kiri (CRITICAL-ISSUE-7 / CRITICAL-ISSUE-8). */
export function sideNavItems(_role: Role): NavItem[] {
  return [
    { href: "/", label: "Dashboard" },
    {
      label: "Data Induk",
      children: [
        {
          href: "/data-induk/program-kegiatan",
          label: "Data Program Kegiatan Bidang",
        },
        { href: "/data-induk/sumber-dana", label: "Data Sumber Dana" },
        { href: "/data-induk/jenis-belanja", label: "Data Jenis Belanja" },
        { href: "/data-induk/jenis-kontrak", label: "Data Jenis Kontrak" },
        {
          href: "/data-induk/metode-pbj",
          label: "Data Metode Pemilihan Penyedia Barang Jasa",
        },
      ],
    },
    {
      label: "Data Kontrak",
      children: [
        { href: "/kontrak", label: "Data Kontrak" },
        { href: "/data-induk/penyedia", label: "Data Penyedia Barang Jasa" },
        {
          href: "/data-induk/konsultan",
          label: "Data Konsultan Pengawas/MK",
        },
        { href: "/kontrak/addendum", label: "Data Addendum" },
        { href: "/kontrak/pho-bast", label: "Data PHO/BAST" },
        { href: "/kontrak/pembayaran", label: "Data Pembayaran" },
      ],
    },
    {
      label: "Realisasi Fisik Keuangan",
      children: [
        { href: "/rfk", label: "Data Realisasi Fisik Keuangan" },
        { href: "/verval", label: "Verifikasi / Validasi" },
      ],
    },
    {
      label: "Laporan",
      children: [
        { href: "/laporan", label: "Laporan Realisasi Fisik Keuangan" },
      ],
    },
  ];
}

function pathActive(current: string, href: string): boolean {
  if (href === "/") return current === "/" || current === "";
  return current === href;
}

function groupOpen(current: string, children: NavLeaf[]): boolean {
  return children.some(
    (c) => current === c.href || current.startsWith(`${c.href}/`),
  );
}

function renderSideNav(role: Role, currentPath: string): string {
  return sideNavItems(role)
    .map((item) => {
      if (!isGroup(item)) {
        const active = pathActive(currentPath, item.href) ? " active" : "";
        return `<a class="side-link${active}" href="${item.href}" data-nav="${item.href}">${escapeHtml(item.label)}</a>`;
      }
      const open = groupOpen(currentPath, item.children) ? " open" : "";
      const children = item.children
        .map((c) => {
          const active = pathActive(currentPath, c.href) ? " active" : "";
          return `<a class="side-link side-sub${active}" href="${c.href}" data-nav="${c.href}">${escapeHtml(c.label)}</a>`;
        })
        .join("");
      return `<details class="side-group" data-group${open}>
        <summary>${escapeHtml(item.label)}</summary>
        <div class="side-children">${children}</div>
      </details>`;
    })
    .join("");
}

export function isDevMode(): boolean {
  return process.env.npm_lifecycle_event === "dev";
}

function liveReload(): string {
  if (!isDevMode()) return "";
  return `<script>
(function () {
  var id = "";
  function tick() {
    fetch("/dev/build-id", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (n) {
        if (id && n !== id) location.reload();
        id = n;
      })
      .catch(function () {})
      .finally(function () { setTimeout(tick, 800); });
  }
  tick();
})();
</script>`;
}

export function page(opts: {
  title: string;
  user?: AuthUser | null;
  notice?: string;
  error?: string;
  body: string;
  bodyClass?: string;
  /** Path aktif untuk highlight menu kiri (default: tidak diketahui). */
  path?: string;
  /** Skrip tambahan sebelum penutup body (mis. Chart.js dashboard). */
  scripts?: string;
}): string {
  const banner = opts.error
    ? `<div class="flash error">${escapeHtml(opts.error)}</div>`
    : opts.notice
      ? `<div class="flash ok">${escapeHtml(opts.notice)}</div>`
      : "";

  if (!opts.user) {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.title)} — SIREFIK</title>
  <link rel="icon" href="/aset/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/aset/app.css">
</head>
<body${opts.bodyClass ? ` class="${escapeHtml(opts.bodyClass)}"` : ""}>
  <header class="top">
    <a class="brand" href="/">
      <span class="mark">SF</span>
      <span>
        <strong>SIREFIK</strong>
        <small>Realisasi Fisik dan Keuangan</small>
      </span>
    </a>
  </header>
  <main class="wrap">
    ${banner}
    ${opts.body}
  </main>
  ${liveReload()}
  ${opts.scripts ?? ""}
</body>
</html>`;
  }

  const currentPath = opts.path ?? "/";
  const side = renderSideNav(opts.user.role, currentPath);
  const classes = ["app-shell", opts.bodyClass].filter(Boolean).join(" ");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.title)} — SIREFIK</title>
  <link rel="icon" href="/aset/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/aset/app.css">
</head>
<body class="${escapeHtml(classes)}">
  <header class="top top-app">
    <button type="button" class="side-toggle" id="side-toggle" aria-label="Buka menu">☰</button>
    <a class="brand" href="/">
      <span class="mark">SF</span>
      <span>
        <strong>SIREFIK</strong>
        <small>Realisasi Fisik dan Keuangan</small>
      </span>
    </a>
    <div class="userbox">
      <span>${escapeHtml(opts.user.nama)} · ${roleLabel(opts.user.role)}</span>
      <a href="/keluar">Keluar</a>
    </div>
  </header>
  <div class="app-body">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">Menu Navigasi</div>
      <nav class="side-nav">${side}</nav>
    </aside>
    <main class="app-main">
      ${banner}
      ${opts.body}
    </main>
  </div>
  <script>
    (function () {
      var path = location.pathname.replace(/\\/$/, "") || "/";
      document.querySelectorAll(".side-link").forEach(function (a) {
        var href = a.getAttribute("data-nav") || a.getAttribute("href") || "";
        var active = href === "/" ? path === "/" : path === href;
        a.classList.toggle("active", active);
        var inGroup = href !== "/" && (path === href || path.indexOf(href + "/") === 0);
        if (active || inGroup) {
          var group = a.closest("details.side-group");
          if (group) group.open = true;
        }
      });
      var btn = document.getElementById("side-toggle");
      var side = document.getElementById("sidebar");
      if (!btn || !side) return;
      btn.addEventListener("click", function () {
        document.body.classList.toggle("sidebar-open");
      });
    })();
  </script>
  ${liveReload()}
  ${opts.scripts ?? ""}
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function money(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(v) ? v : 0);
}

export function num(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("id-ID").format(Number.isFinite(v) ? v : 0);
}

export { html, raw };
