import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { startServer } from "./server.js";
import { projectRoot } from "./kernel/paths.js";

async function main() {
  await app.whenReady();
  process.env.SIREFIK_PUBLIC = app.isPackaged
    ? join(process.resourcesPath, "public")
    : join(projectRoot(), "public");
  process.env.SIREFIK_DATA = join(app.getPath("userData"), "data");
  const { url } = await startServer(3847);
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    title: "SIREFIK",
    webPreferences: { sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });
  await win.loadURL(url);
}

app.on("window-all-closed", () => app.quit());
main().catch((err) => {
  console.error(err);
  app.quit();
});
