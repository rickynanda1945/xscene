import { db, one, rows, run, transaction, audit, type DB } from "./db";
import { lockAccount, quota } from "./accounts";
import { required } from "./errors";
import { storeImage, removeFile } from "./storage";
export const LIBRARIES = [
  "products",
  "characters",
  "brands",
  "logos",
  "backgrounds",
  "assets",
];
export async function library(
  uid: string,
  kind: string,
  page = 1,
  id?: string,
) {
  required(LIBRARIES.includes(kind), "Unknown library.");
  let sql = "",
    where = "";
  const args: unknown[] = [uid];
  if (id) {
    where = " AND e.id=?";
    args.push(id);
  }
  if (kind === "brands")
    sql =
      "SELECT e.* FROM brands e WHERE e.user_id=?" +
      where +
      (id ? "" : " AND e.archived=0");
  else if (["products", "characters"].includes(kind))
    sql =
      `SELECT e.*,a.original_filename,a.reference_name,a.mime_type FROM ${kind} e LEFT JOIN assets a ON a.id=e.reference_asset_id AND a.user_id=e.user_id WHERE e.user_id=?` +
      where +
      (id ? "" : " AND (a.id IS NULL OR a.asset_type NOT LIKE 'archived_%')");
  else {
    sql =
      "SELECT e.id,e.id AS reference_asset_id,e.original_filename AS name,e.original_filename,e.reference_name,e.mime_type,e.asset_type FROM assets e WHERE e.user_id=?" +
      where;
    const type =
      kind === "logos" ? "brand" : kind === "backgrounds" ? "scene" : "";
    if (type) {
      sql += " AND e.asset_type IN (" + (id ? "?,?" : "?") + ")";
      args.push(type);
      if (id) args.push("archived_" + type);
    } else sql += " AND e.asset_type NOT LIKE 'archived_%'";
  }
  sql += id ? "" : " ORDER BY e.id DESC LIMIT 24 OFFSET " + (page - 1) * 24;
  const result = await rows(sql, args);
  if (id) {
    required(result[0], "Library item unavailable.", 404);
    return result[0];
  }
  return result;
}
export async function uploadAsset(
  uid: string,
  file: File,
  type: string,
  name: string,
  description: string,
) {
  required(
    ["product", "character", "scene", "style", "brand", "other"].includes(type),
    "Invalid asset type.",
  );
  const saved = await storeImage(file, "uploads");
  try {
    return await transaction(async (c) => {
      const u = await lockAccount(uid, c);
      await quota(u, "storage", file.size, c);
      const result = await run(
        "INSERT INTO assets(user_id,asset_type,original_filename,reference_name,stored_filename,storage_path,mime_type,file_size,width,height) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          uid,
          type,
          saved.name,
          "PENDING_" + saved.stored.split("/").at(-1),
          saved.stored.split("/").at(-1),
          saved.stored,
          saved.mime,
          file.size,
          saved.width,
          saved.height,
        ],
        c,
      );
      const id = String(result.insertId),
        alias = type.toUpperCase() + "_REF_" + id.padStart(2, "0");
      await run(
        "UPDATE assets SET reference_name=? WHERE id=?",
        [alias, id],
        c,
      );
      if (["product", "character"].includes(type))
        await run(
          `INSERT INTO ${type === "product" ? "products" : "characters"}(user_id,name,reference_asset_id,description) VALUES (?,?,?,?)`,
          [
            uid,
            name.trim().slice(0, 180) || saved.name.replace(/\.[^.]+$/, ""),
            id,
            description.slice(0, 12000),
          ],
          c,
        );
      await audit("asset_uploaded", id, uid, c);
      return { id, reference_name: alias, original_filename: saved.name };
    });
  } catch (e) {
    await removeFile(saved.stored);
    throw e;
  }
}
export async function archiveAsset(
  uid: string,
  id: string,
  expectedType?: string,
  c: DB = db(),
) {
  const a = await one(
    "SELECT * FROM assets WHERE id=? AND user_id=?",
    [id, uid],
    c,
  );
  required(
    a &&
      !a.asset_type.startsWith("archived_") &&
      (!expectedType || a.asset_type === expectedType),
    "Asset unavailable.",
    404,
  );
  const result = await run(
    "UPDATE assets SET asset_type=? WHERE id=? AND user_id=? AND asset_type=?",
    ["archived_" + a.asset_type, id, uid, a.asset_type],
    c,
  );
  required(result.affectedRows, "Asset unavailable.", 404);
}
export async function deleteLibrary(uid: string, kind: string, id: string) {
  required(LIBRARIES.includes(kind), "Unknown library.");
  await transaction(async (c) => {
    await lockAccount(uid, c);
    if (kind === "brands") {
      required(
        (
          await run(
            "UPDATE brands SET archived=1 WHERE id=? AND user_id=? AND archived=0",
            [id, uid],
            c,
          )
        ).affectedRows,
        "Brand unavailable.",
        404,
      );
    } else {
      let aid = id;
      if (["products", "characters"].includes(kind)) {
        const item = await one(
          `SELECT reference_asset_id FROM ${kind} WHERE id=? AND user_id=?`,
          [id, uid],
          c,
        );
        required(item?.reference_asset_id, "Asset unavailable.", 404);
        aid = String(item.reference_asset_id);
      }
      await archiveAsset(
        uid,
        aid,
        (
          {
            products: "product",
            characters: "character",
            backgrounds: "scene",
            logos: "brand",
          } as Record<string, string>
        )[kind],
        c,
      );
    }
    await audit("library_deleted", kind + ":" + id, uid, c);
  });
}
