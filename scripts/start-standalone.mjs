// Starts the production build produced by `next build` with `output: "standalone"`.
// The standalone server does not serve `public/` or `.next/static/` unless they are copied
// next to it, so this copies them first (the Dockerfile does the same at image build time).
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("No standalone build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

const child = spawn(process.execPath, [path.join(standalone, "server.js")], {
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT ?? "3000", HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0" },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
