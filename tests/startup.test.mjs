import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { databaseConfig } from "../scripts/runtime-config.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const secret = "fixture-secret-which-must-never-be-logged";
const password = "fixture-password@which-must-never-be-logged";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "xscene-startup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(project, "scripts"), join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "src/lib"), { recursive: true });
  cpSync(join(project, "src/lib/release.json"), join(root, "src/lib/release.json"));
  writeFileSync(join(root, "scripts/migrate.mjs"), 'console.log("FIXTURE_MIGRATION",process.env.DB_HOST);process.exit(Number(process.env.FIXTURE_EXIT || 0));\n');
  writeFileSync(join(root, "server.js"), 'console.log("FIXTURE_SERVER",process.env.DB_HOST);\n');
  const checked = spawnSync(process.execPath, ["scripts/check-startup.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  const config = join(root, "runtime.env");
  const values = {
    DB_HOST: "runtime-mysql", DB_PORT: "3306", DB_NAME: "xscene", DB_USER: "xscene_user",
    DB_PASSWORD: password, AUTH_SECRET: secret, APP_URL: "https://xscene.example",
    AUTO_MIGRATE: "true",
  };
  return {
    root, config, values,
    mount(extra = {}) {
      writeFileSync(config, Object.entries({ ...values, DB_HOST: "mounted-mysql", ...extra })
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
    },
    run(overrides = {}, mountedOnly = false) {
      return spawnSync("sh", ["scripts/start-container.sh"], {
        cwd: root, encoding: "utf8", env: {
          PATH: process.env.PATH, XSCENE_ENV_FILE: config,
          ...(mountedOnly ? {} : values), ...overrides,
        },
      });
    },
  };
}

test("Missing database configuration names keys without exposing values", () => {
  assert.throws(() => databaseConfig({ DB_PASSWORD: password }), (error) => {
    assert.equal(error.code, "CONFIGURATION_ERROR");
    assert.match(error.message, /DB_HOST/);
    assert(!error.message.includes(password));
    return true;
  });
});

test("Invalid database ports and surrounding whitespace are rejected", () => {
  const env = { DB_HOST: "mysql", DB_NAME: "xscene", DB_USER: "user", DB_PASSWORD: password };
  for (const DB_PORT of ["0", "3306.5", "65536", "abc"]) {
    assert.throws(() => databaseConfig({ ...env, DB_PORT }), /DB_PORT/);
  }
  assert.throws(() => databaseConfig({ ...env, DB_NAME: "\txscene" }), /whitespace/);
  assert.equal(databaseConfig(env).password, password);
});

test("Runtime Environment starts migration and server without a private file", (t) => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release=1\.0\.1-dokploy-fix/);
  assert.match(result.stdout, /FIXTURE_MIGRATION runtime-mysql/);
  assert.match(result.stdout, /FIXTURE_SERVER runtime-mysql/);
  assert(!result.stdout.includes(secret));
  assert(!result.stdout.includes(password));
});

test("Private File Mount config reaches both migration and server", (t) => {
  const f = fixture(t);
  f.mount();
  const result = f.run({}, true);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /privateConfigMounted: true/);
  assert.match(result.stdout, /FIXTURE_MIGRATION mounted-mysql/);
  assert.match(result.stdout, /FIXTURE_SERVER mounted-mysql/);
  assert(!result.stdout.includes(secret));
  assert(!result.stdout.includes(password));
});

test("Runtime Environment takes precedence over the mounted file", (t) => {
  const f = fixture(t);
  f.mount();
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /FIXTURE_SERVER runtime-mysql/);
});

test("Mounted AUTO_MIGRATE=false skips migration and still starts server", (t) => {
  const f = fixture(t);
  f.mount({ AUTO_MIGRATE: "false" });
  const result = f.run({}, true);
  assert.equal(result.status, 0, result.stderr);
  assert(!result.stdout.includes("FIXTURE_MIGRATION"));
  assert.match(result.stdout, /FIXTURE_SERVER mounted-mysql/);
});

test("Missing runtime configuration stops before migration with a useful error", (t) => {
  const f = fixture(t), result = f.run({ DB_HOST: "", DB_PORT: "" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /hostConfigured: false/);
  assert.match(result.stderr, /CONFIGURATION_ERROR: Missing DB_HOST/);
  assert(!result.stdout.includes("FIXTURE_MIGRATION"));
  assert(!result.stdout.includes("FIXTURE_SERVER"));
  assert(!(result.stdout + result.stderr).includes(password));
});

test("Failed migration prevents server startup", (t) => {
  const f = fixture(t), result = f.run({ FIXTURE_EXIT: "7" });
  assert.equal(result.status, 7);
  assert.match(result.stdout, /FIXTURE_MIGRATION/);
  assert(!result.stdout.includes("FIXTURE_SERVER"));
});

test("Startup files overwritten after build are detected before execution", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "scripts/migrate.mjs"), "});\n");
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Startup file differs from the built image: scripts\/migrate.mjs/);
  assert(!result.stdout.includes("FIXTURE_SERVER"));
});

test("Syntax error in migration fails the build check", (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, "scripts/migrate.mjs"), "});\n");
  const result = spawnSync(process.execPath, ["scripts/check-startup.mjs"], { cwd: f.root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid startup script: scripts\/migrate.mjs/);
});
