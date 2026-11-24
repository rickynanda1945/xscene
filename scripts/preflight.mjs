import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { ConfigurationError, validateApplicationConfig } from "./runtime-config.mjs";

try {
  const root = new URL("../", import.meta.url);
  const build = JSON.parse(await readFile(new URL("build-info.json", root), "utf8"));
  for (const [file, expected] of Object.entries(build.files)) {
    const actual = createHash("sha256").update(await readFile(new URL(file, root))).digest("hex");
    if (actual !== expected) {
      throw new ConfigurationError(`Startup file differs from the built image: ${file}. Check Dokploy File Mounts and deploy the intended source.`);
    }
  }
  const migration = build.files["scripts/migrate.mjs"];
  console.log(`[XSCENE START] release=${build.release} migration=${migration.slice(0, 12)}`);
  console.log("[DB CHECK]", {
    hostConfigured: Boolean(process.env.DB_HOST?.trim()),
    usingLocalhost: ["", "localhost", "127.0.0.1"].includes((process.env.DB_HOST || "").trim()),
    portConfigured: Boolean(process.env.DB_PORT?.trim()),
    privateConfigMounted: existsSync(process.env.XSCENE_ENV_FILE || "/run/xscene.env"),
  });
  validateApplicationConfig();
  console.log("[XSCENE START] Runtime configuration verified.");
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(`[XSCENE START] ${error.code}: ${error.message}`);
  } else {
    console.error("[XSCENE START] RELEASE_CHECK_FAILED: Build metadata or startup files could not be read. Check File Mounts and redeploy the complete package.");
  }
  process.exitCode = 1;
}
