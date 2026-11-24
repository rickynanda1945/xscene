import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { databaseConfig, ConfigurationError } from "./runtime-config.mjs";

async function migrate() {
const connection = await mysql.createConnection({
  ...databaseConfig(),
  multipleStatements: false,
  charset: "utf8mb4",
  timezone: "Z"
});

try {
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK(CONCAT(DATABASE(),':xscene-migration'),60) AS acquired"
  );

  if (!lock.acquired) {
    throw new Error("Another migration is running.");
  }

  for (const file of [
    "001_schema.sql",
    "002_templates.sql",
    "003_multiuser.sql",
    "004_node.sql"
  ]) {
    const source = (
      await readFile(
        new URL("../database/" + file, import.meta.url),
        "utf8"
      )
    ).replace(/^--.*$/gm, "");

    const statements = source
      .split(";")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const sql of statements) {
      const alter = sql.match(/^ALTER TABLE (\w+) (.+)$/s);

      if (alter) {
        for (let part of alter[2].split(/,\s*ADD COLUMN /)) {
          part = part.replace(/^ADD COLUMN /, "");

          const column = part.match(/^(\w+)/)[1];

          const [[found]] = await connection.execute(
            "SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
            [alter[1], column]
          );

          if (!Number(found.total)) {
            await connection.query(
              "ALTER TABLE " + alter[1] + " ADD COLUMN " + part
            );
          }
        }
      } else {
        await connection.query(sql);
      }
    }

    console.log("Applied " + file);
  }

  await connection.execute(
    "INSERT IGNORE INTO node_migrations(name) VALUES ('node-initial')"
  );

  console.log(
    "Migration complete. Existing rows and ownership preserved."
  );
} finally {
  await connection
    .query(
      "SELECT RELEASE_LOCK(CONCAT(DATABASE(),':xscene-migration'))"
    )
    .catch(() => {});

  await connection.end();
}
}

try {
  await migrate();
} catch (error) {
  const hints = {
    ENOTFOUND: "DB_HOST could not be resolved. Check the MySQL internal hostname and shared Docker network.",
    EAI_AGAIN: "MySQL DNS lookup temporarily failed. Check the shared Docker network.",
    ECONNREFUSED: "MySQL refused the connection. Check that MySQL is running and DB_PORT is its internal port.",
    ETIMEDOUT: "The MySQL connection timed out. Check service readiness and network access.",
    ER_ACCESS_DENIED_ERROR: "MySQL rejected the account. Check DB_USER, DB_PASSWORD and database grants.",
    ER_BAD_DB_ERROR: "DB_NAME does not exist on the selected MySQL service.",
  };
  if (error instanceof ConfigurationError) {
    console.error(`[XSCENE MIGRATION] ${error.code}: ${error.message}`);
  } else {
    const code = /^[A-Z0-9_]+$/.test(error?.code || "") ? error.code : "MIGRATION_FAILED";
    console.error(`[XSCENE MIGRATION] ${code}: ${hints[code] || "Migration failed. Check the database schema and migration privileges."}`);
  }
  process.exitCode = 1;
}
