import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const release = JSON.parse(await readFile(new URL("src/lib/release.json", root), "utf8"));
const scripts = (await readdir(new URL("scripts/", root)))
  .filter((name) => name.endsWith(".mjs") || name.endsWith(".sh"))
  .sort();
const files = {};
for (const name of scripts) {
  const relative = "scripts/" + name;
  const path = fileURLToPath(new URL(relative, root));
  const check = name.endsWith(".mjs")
    ? spawnSync(process.execPath, ["--check", path], { stdio: "inherit" })
    : spawnSync("sh", ["-n", path], { stdio: "inherit" });
  if (check.error || check.status !== 0) {
    console.error(`[XSCENE BUILD] Invalid startup script: ${relative}`);
    process.exit(1);
  }
  files[relative] = createHash("sha256").update(await readFile(path)).digest("hex");
}
await writeFile(new URL("build-info.json", root), JSON.stringify({ release: release.version, files }, null, 2) + "\n");
console.log(`[XSCENE BUILD] release=${release.version} migration=${files["scripts/migrate.mjs"].slice(0, 12)}; startup syntax verified.`);
