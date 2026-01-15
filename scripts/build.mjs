// scripts/build.mjs
import { rm, mkdir, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const dist = path.join(root, "dist");

async function run() {
  // clean dist
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // copy static files
  await copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));
  await copyFile(path.join(root, "styles.css"), path.join(dist, "styles.css"));

  // run esbuild
  await new Promise((resolve, reject) => {
    const args = [
      "app.js",
      "--bundle",
      "--minify",
      "--format=esm",
      "--outfile=dist/app.js",
    ];

    const p = spawn("esbuild", args, { stdio: "inherit", shell: true });
    p.on("close", (code) => (code === 0 ? resolve() : reject(code)));
  });
}

run().catch((e) => {
  console.error("Build failed:", e);
  process.exit(1);
});
