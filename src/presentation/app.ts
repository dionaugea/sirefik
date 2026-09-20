import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { publicDir, uploadsDir } from "../kernel/index.js";
import { isSetupComplete } from "../setup/index.js";
import { authRoutes } from "./auth-routes.js";
import { masterRoutes } from "./master-routes.js";
import { rfkRoutes } from "./rfk-routes.js";
import { vervalRoutes } from "./verval-routes.js";
import { laporanRoutes } from "./laporan-routes.js";
import { homeRoutes } from "./home-routes.js";
import { kontrakRoutes } from "./kontrak-routes.js";
import { landingPage, registerRoutes } from "./register-routes.js";

const BUILD_ID = String(Date.now());

async function svgFavicon() {
  return readFile(join(publicDir(), "favicon.svg"));
}

export function createApp() {
  const app = new Hono();

  app.get("/dev/build-id", (c) => c.text(BUILD_ID));

  app.get("/aset/app.css", async (c) => {
    const css = await readFile(join(publicDir(), "app.css"));
    return c.body(new Uint8Array(css), 200, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store",
    });
  });

  app.get("/aset/favicon.svg", async (c) => {
    const svg = await svgFavicon();
    return c.body(new Uint8Array(svg), 200, { "Content-Type": "image/svg+xml" });
  });

  app.get("/aset/logo-entitas-default.svg", async (c) => {
    const svg = await readFile(join(publicDir(), "logo-entitas-default.svg"));
    return c.body(new Uint8Array(svg), 200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    });
  });

  app.get("/favicon.svg", async (c) => {
    const svg = await svgFavicon();
    return c.body(new Uint8Array(svg), 200, { "Content-Type": "image/svg+xml" });
  });

  app.get("/favicon.ico", async (c) => {
    const svg = await svgFavicon();
    return c.body(new Uint8Array(svg), 200, { "Content-Type": "image/svg+xml" });
  });

  app.get("/aset/unggahan/:nama", async (c) => {
    try {
      const nama = c.req.param("nama");
      if (nama.includes("..") || nama.includes("/") || nama.includes("\\")) {
        return c.notFound();
      }
      const buf = await readFile(join(uploadsDir(), nama));
      return c.body(new Uint8Array(buf), 200);
    } catch {
      return c.notFound();
    }
  });

  app.use("*", async (c, next) => {
    const path = c.req.path;
    if (
      path.startsWith("/aset/") ||
      path.startsWith("/dev/") ||
      path === "/favicon.ico" ||
      path === "/favicon.svg"
    ) {
      return next();
    }
    const done = await isSetupComplete();
    if (!done) {
      if (path === "/" || path.startsWith("/daftar")) return next();
      return c.redirect("/");
    }
    if (path.startsWith("/daftar")) return c.redirect("/masuk");
    await next();
  });

  app.get("/", async (c, next) => {
    if (!(await isSetupComplete())) return c.html(landingPage());
    return next();
  });

  app.route("/", registerRoutes);
  app.route("/", homeRoutes);
  app.route("/", authRoutes);
  app.route("/", masterRoutes);
  app.route("/", kontrakRoutes);
  app.route("/", rfkRoutes);
  app.route("/", vervalRoutes);
  app.route("/", laporanRoutes);

  app.notFound((c) =>
    c.html(
      `<!DOCTYPE html><html lang="id"><head><link rel="icon" href="/aset/favicon.svg" type="image/svg+xml"></head><body><p>Halaman tidak ditemukan.</p><p><a href="/">Kembali</a></p></body></html>`,
      404,
    ),
  );
  return app;
}
