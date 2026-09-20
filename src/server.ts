import { serve } from "@hono/node-server";
import { createApp } from "./presentation/app.js";
import { closeDb, getDb, migrateKernel } from "./kernel/index.js";
import { seedIfEmpty } from "./kernel/seed.js";

export async function startServer(port = Number(process.env.PORT ?? 3847)) {
  await migrateKernel(getDb());
  await seedIfEmpty();
  const app = createApp();
  const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  return { server, port, url: `http://127.0.0.1:${port}` };
}

export async function stopServer(server?: {
  close: (cb?: (err?: Error) => void) => void;
}) {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  await closeDb();
}
