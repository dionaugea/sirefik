import { escapeHtml } from "./ui.js";

export const PAGE_SIZES = [15, 25, 50] as const;

export type ListQuery = {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  perPage: number;
};

type QuerySource = {
  query: (key: string) => string | undefined;
};

export function parseListQuery(
  src: QuerySource,
  defaults: { sort: string; dir?: "asc" | "desc" },
): ListQuery {
  const q = (src.query("q") ?? "").trim();
  const sort = (src.query("sort") ?? defaults.sort).trim() || defaults.sort;
  const dirRaw = (src.query("dir") ?? defaults.dir ?? "asc").toLowerCase();
  const dir: "asc" | "desc" = dirRaw === "desc" ? "desc" : "asc";
  const perRaw = Number(src.query("per") ?? 15);
  const perPage = PAGE_SIZES.includes(perRaw as (typeof PAGE_SIZES)[number])
    ? perRaw
    : 15;
  const page = Math.max(1, Number(src.query("page") ?? 1) || 1);
  return { q, sort, dir, page, perPage };
}

export function applyList<T>(
  rows: T[],
  query: ListQuery,
  opts: {
    match: (row: T, q: string) => boolean;
    getters: Record<string, (row: T) => string | number | null | undefined>;
  },
): { pageRows: T[]; total: number; query: ListQuery } {
  const q = query.q.toLowerCase();
  let filtered = q ? rows.filter((r) => opts.match(r, q)) : rows.slice();
  const getter = opts.getters[query.sort] ?? opts.getters[Object.keys(opts.getters)[0]!];
  if (getter) {
    filtered.sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""), "id", { numeric: true });
      return query.dir === "desc" ? -cmp : cmp;
    });
  }
  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / query.perPage) || 1);
  const page = Math.min(query.page, maxPage);
  const start = (page - 1) * query.perPage;
  return {
    pageRows: filtered.slice(start, start + query.perPage),
    total,
    query: { ...query, page },
  };
}

function buildQs(
  query: ListQuery,
  patch: Partial<ListQuery> = {},
): string {
  const next = { ...query, ...patch };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  if (next.sort) p.set("sort", next.sort);
  if (next.dir) p.set("dir", next.dir);
  if (next.perPage !== 15) p.set("per", String(next.perPage));
  if (next.page > 1) p.set("page", String(next.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function rowNumber(query: ListQuery, indexOnPage: number): number {
  return (query.page - 1) * query.perPage + indexOnPage + 1;
}

export function sortTh(
  path: string,
  query: ListQuery,
  key: string,
  label: string,
  extraClass = "",
): string {
  const active = query.sort === key;
  const nextDir = active && query.dir === "asc" ? "desc" : "asc";
  const href = `${path}${buildQs(query, { sort: key, dir: nextDir, page: 1 })}`;
  const mark = active ? (query.dir === "asc" ? " ▲" : " ▼") : "";
  const cls = extraClass ? `sortable ${extraClass}` : "sortable";
  return `<th class="${cls}"><a href="${escapeHtml(href)}">${escapeHtml(label)}${mark}</a></th>`;
}

export function renderTableChrome(opts: {
  path: string;
  query: ListQuery;
  total: number;
  tableHead: string;
  tableBody: string;
  emptyColspan: number;
}): string {
  const { path, query, total } = opts;
  const showPager = total > 15;
  const maxPage = Math.max(1, Math.ceil(total / query.perPage) || 1);
  const from = total === 0 ? 0 : (query.page - 1) * query.perPage + 1;
  const to = Math.min(total, query.page * query.perPage);

  const search = `<form class="table-search" method="get" action="${escapeHtml(path)}">
    <input type="search" name="q" value="${escapeHtml(query.q)}" placeholder="Cari cepat…" aria-label="Cari cepat">
    <input type="hidden" name="sort" value="${escapeHtml(query.sort)}">
    <input type="hidden" name="dir" value="${escapeHtml(query.dir)}">
    <input type="hidden" name="per" value="${query.perPage}">
    <button type="submit" class="btn ghost">Cari</button>
  </form>`;

  const pager = showPager
    ? `<div class="table-pager">
        <label class="pager-size">Tampilkan
          <select onchange="location.href=this.value">
            ${PAGE_SIZES.map((n) => {
              const href = `${path}${buildQs(query, { perPage: n, page: 1 })}`;
              return `<option value="${escapeHtml(href)}"${n === query.perPage ? " selected" : ""}>${n}</option>`;
            }).join("")}
          </select>
          baris
        </label>
        <span class="muted">${from}–${to} dari ${total}</span>
        <div class="pager-nav">
          ${
            query.page > 1
              ? `<a class="btn ghost" href="${escapeHtml(path + buildQs(query, { page: query.page - 1 }))}">Sebelumnya</a>`
              : `<span class="btn ghost disabled">Sebelumnya</span>`
          }
          <span class="muted">Hal ${query.page}/${maxPage}</span>
          ${
            query.page < maxPage
              ? `<a class="btn ghost" href="${escapeHtml(path + buildQs(query, { page: query.page + 1 }))}">Berikutnya</a>`
              : `<span class="btn ghost disabled">Berikutnya</span>`
          }
        </div>
      </div>`
    : total > 0
      ? `<div class="table-pager"><span class="muted">${total} data</span></div>`
      : "";

  const body =
    opts.tableBody ||
    `<tr><td colspan="${opts.emptyColspan}">Belum ada data.</td></tr>`;

  return `<div class="table-panel">
    <div class="table-toolbar">
      <span class="table-meta muted">${total} data</span>
      ${search}
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr>${opts.tableHead}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${pager}
  </div>`;
}

export function actionButtons(ubahHref: string, hapusAction: string): string {
  return `<td class="row-actions">
    <a class="btn ghost" href="${escapeHtml(ubahHref)}">Ubah</a>
    <form method="post" action="${escapeHtml(hapusAction)}" onsubmit="return confirm('Hapus data ini?')">
      <button type="submit" class="btn ghost">Hapus</button>
    </form>
  </td>`;
}
