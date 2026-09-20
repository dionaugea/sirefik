import { startServer, stopServer } from "./server.js";

const { url, server } = await startServer();
console.log(`SIREFIK berjalan di ${url}`);

async function shutdown() {
  await stopServer(server);
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
