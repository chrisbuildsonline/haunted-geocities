// Serves fixtures/ over HTTP for the e2e tests. Usage: bun scripts/fixture-server.ts [port]
import { join, normalize, sep } from "node:path";

const dir = join(import.meta.dir, "..", "fixtures");
const port = Number(process.argv[2] ?? 4321);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (path === "/gone" || path === "/gone/") return new Response("Gone", { status: 410 });
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(dir, path));
    if (!file.startsWith(dir + sep)) return new Response("Not found", { status: 404 });
    const f = Bun.file(file);
    return (await f.exists()) ? new Response(f) : new Response("Not found", { status: 404 });
  },
});

console.log(`fixtures on http://127.0.0.1:${server.port}`);
