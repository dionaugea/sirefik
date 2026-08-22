# SIREFIK — High-Level Implementation Plan

This plan is for a junior programmer or a low-level AI model. Implement only what this document and [issue.md](issue.md) state. Do not invent extra product features.

**SIREFIK** = Sistem Informasi Realisasi Fisik dan Keuangan. A web app for Pemerintah Daerah (starting Kabupaten Puncak Jaya) to record, verify, and report physical and financial realization of regional expenditure, especially contracted work packages.

---

## 1. Goal

One web application so OPD can replace manual Excel RFK reporting: master data → transaksi RFK → verval berjenjang → laporan.

## 2. Stack (install these)

| Layer | Choice |
| --- | --- |
| Runtime | Node.js |
| HTTP / UI | Hono |
| Database | PostgreSQL |
| Data access | Kysely only (no raw SQL in handlers) |
| Packaging | electron-builder |

Do **not** use Laravel or PHP. Source docs may mention those; take business process, actors, and entities only.

Add other packages only when a later phase actually needs them (for example: Postgres driver for Kysely, TypeScript, file upload, Excel/PDF export, electron-builder).

## 3. Constraints

- **Language:** UI is Bahasa Indonesia only. No English UI, no i18n switch. Code identifiers may stay English.
- **One instance = one entitas.** Many OPD. Users belong to OPD/bidang.
- **Modular monolith:** one deployable app; source split by business module. Modules talk through explicit module APIs, not deep cross-imports.
- **Open scope:** if it is not written here or in issue.md, skip it.

## 4. Architecture (high level)

```
Presentation (Hono UI + routes)
        ↓
Business modules (rules, use cases)
        ↓
Persistence (Kysely per module)
        ↓
PostgreSQL
```

### Modules

| Module | Owns |
| --- | --- |
| **Kernel** | HTTP app, auth context, DB client. Thin shared layer only. |
| **Identity** | Users and roles: Administrator, Staf, Eselon 3 (bidang), Pimpinan (Eselon 2) |
| **Organization** | Entitas Pemda, OPD, PPK/PPTK |
| **Catalog** | Jenis belanja (3 levels), sumber dana, metode pemilihan PBJ, jenis kontrak, lokasi (provinsi–kabupaten–distrik–desa + koordinat) |
| **Parties** | Penyedia/rekanan, lembaga penerima hibah, konsultan pengawas/MK |
| **Rfk** | Paket pekerjaan / transaksi RFK, addendum, pembayaran (termin), STS/denda, progress fisik, PHO/BAST |
| **Verification** | Verval berjenjang: Staf → Eselon 3 → Pimpinan |
| **Reporting** | Dashboard, laporan RFK, peta lokasi, export/import |

Each module owns its tables and persistence. Presentation calls business; business calls that module’s persistence.

### Actors

- **Administrator** — users and all master data
- **Staf** — input RFK and supporting transactions; first-level verify
- **Eselon 3** — validate data bidang; export/import
- **Pimpinan** — final approve; dashboard; official report

### Verval states

`Draft` → `VerifiedByStaf` → `ValidatedByEselon3` → `ApprovedByPimpinan`

### Hub entity

**TransaksiRFK** is the center. It links to catalogs, parties, lokasi, addendum, pembayaran, STS, and verval. Conceptual only — design tables when implementing, do not over-specify up front.

### Menus (UI)

Role-based menus: **Data Induk**, **Data RFK**, **Laporan**, **Petunjuk**.

## 5. Business flow (implement in this order)

1. Instalasi (local app / packaged exe)
2. Registrasi entitas, OPD, user
3. Data induk (catalogs + parties)
4. Input RFK (kontrak / paket)
5. Addendum, pembayaran, STS, prestasi fisik, PHO/BAST
6. Verval berjenjang
7. Laporan, dashboard, peta, export/import

## 6. Implementation phases

Do one phase at a time. Finish a phase before starting the next.

### Phase A — Bootstrap

- Create the Node.js + TypeScript project in this folder as **one** Hono web app.
- Install Hono, Kysely, PostgreSQL client, and whatever is required to run TypeScript.
- App starts and serves a simple Indonesian page (health / home).
- No Laravel/PHP scaffold.

### Phase B — Database kernel

- Connect PostgreSQL through Kysely.
- Shared DB client lives in Kernel. All modules use it. No second data-access style.

### Phase C — Module skeleton

- Create folders (or packages) for Kernel + the seven business modules.
- Each module has a clear public API. Other modules must not import internals.

### Phase D — Data induk

- Identity + Organization: entitas, OPD, users/roles, PPK/PPTK.
- Catalog: jenis belanja, sumber dana, metode PBJ, jenis kontrak, lokasi. Seed/pre-input these catalogs.
- Parties: penyedia, lembaga hibah, konsultan.

### Phase E — Transaksi RFK

- Create and maintain paket/transaksi RFK (kontrak/SPK and related fields).
- Supporting records: addendum, pembayaran (termin), STS/denda, progress fisik, PHO/BAST.
- Evidence uploads (kontrak, BAST, foto/video lokasi) are first-class, not an afterthought.
- Business rules to respect: nilai kontrak vs addendum, % fisik vs % keuangan, keterlambatan/denda/STS, data scoped by OPD.

### Phase F — Verval and reporting

- Hierarchical verification with the four states above. Each role only acts on its step.
- Dashboard, laporan RFK by kelompok belanja, peta lokasi.
- Export/import Excel/CSV/PDF as needed for consolidation.

### Phase G — Packaging

- In development, use electron-builder to package the **same** Hono app.
- Production output: one `*.exe` that starts a **local** web server so each OPD user runs the app on their own machine (no shared remote host required).

## 7. What “done” looks like

- OPD staff can record RFK instead of Excel.
- Data can be verified Staf → Eselon 3 → Pimpinan.
- Pimpinan can see dashboard/laporan.
- App is Indonesian-only, modular, Kysely-backed, and packageable to a local `.exe`.

## 8. Do not

- Do not use Laravel, PHP, or a second ORM.
- Do not put raw SQL in HTTP handlers.
- Do not mix module internals across boundaries.
- Do not add English UI or extra locales.
- Do not build a multi-entitas SaaS; one install = one Pemda.
- Do not add features that are not in this plan or issue.md.
