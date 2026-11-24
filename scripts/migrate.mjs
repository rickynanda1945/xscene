import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
console.log("[DB CHECK]", {
  hostConfigured: Boolean(process.env.DB_HOST?.trim()),
  usingLocalhost: ["", "localhost", "127.0.0.1"].includes(
    (process.env.DB_HOST || "").trim()
  ),
  portConfigured: Boolean(process.env.DB_PORT?.trim())
  console.log("[DB CHECK]", {
  host: process.env.DB_HOST || "(missing)",
  port: process.env.DB_PORT || "(missing)"
});
});
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: false,
  charset: "utf8mb4",
  timezone: "Z",
});
try {
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK(CONCAT(DATABASE(),':xscene-migration'),60) AS acquired",
  );
  if (!lock.acquired) throw new Error("Another migration is running.");
  for (const file of [
    "001_schema.sql",
    "002_templates.sql",
    "003_multiuser.sql",
    "004_node.sql",
  ]) {
    const source = (
      await readFile(new URL("../database/" + file, import.meta.url), "utf8")
    ).replace(/^--.*$/gm, "");
    // Project migrations contain no stored procedures or semicolons inside seed strings.
    for (const sql of source
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean)) {
      const alter = sql.match(/^ALTER TABLE (\w+) (.+)$/s);
      if (alter) {
        for (let part of alter[2].split(/,\s*ADD COLUMN /)) {
          part = part.replace(/^ADD COLUMN /, "");
          const column = part.match(/^(\w+)/)[1];
          const [[found]] = await connection.execute(
            "SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
            [alter[1], column],
          );
          if (!Number(found.total))
            await connection.query(
              "ALTER TABLE " + alter[1] + " ADD COLUMN " + part,
            );
        }
      } else await connection.query(sql);
    }
    console.log("Applied " + file);
  }
  await connection.execute(
    "INSERT IGNORE INTO node_migrations(name) VALUES ('node-initial')",
  );
  console.log("Migration complete. Existing rows and ownership preserved.");
} finally {
  await connection
    .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':xscene-migration'))")
    .catch(() => {});
  await connection.end();
}
