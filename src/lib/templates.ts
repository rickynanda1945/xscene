import {
  db,
  one,
  rows,
  run,
  audit,
  transaction,
  type Row,
  type DB,
} from "./db";
import { FLAGS, CAMERAS } from "./prompts";
import { required } from "./errors";
import { plan, lockAccount, quota } from "./accounts";
import { cloneImage, removeFile, storeImage } from "./storage";
const KEYS = [
  "no_dialogue",
  "outfit_mode",
  "camera_template",
  "frame_script",
  "look_consistency",
  "character_description",
  "location",
  "specific_location",
  "time",
  "weather",
  "activity",
  "action",
  "structure",
  "main_action",
  "hook",
  "cta",
  "style",
  "shot",
  "movement",
  "feel",
  "lens",
  "depth",
  "composition",
  "motion",
  "background_description",
  "include_subtitles",
  "subtitle_mode",
  "subtitle_text",
  "subtitle_position",
  "subtitle_language",
  "subtitle_style",
  "continuous_scenes",
  "scene_number",
  "continuity_bible",
  "previous_scene",
  "lock_identity",
  "lock_face",
  "lock_outfit",
  "lock_lighting",
  "lock_character",
  "lock_product",
  "lock_logo",
  "lock_voice",
  "lock_location",
  "lighting",
  "contrast",
  "exposure",
  "include_dialogue",
  "language",
  "dialogue",
  "voice",
  "accent",
  "ambient",
  "music",
  "visual_detail",
  "pacing",
  "negative",
];
export function cleanTemplate(input: Record<string, any>) {
  const allowed = [
      "name",
      "description",
      "category",
      "style",
      "goal",
      "location",
      "action",
      "structure",
      "idea",
      "color",
      "settings",
    ],
    t: Record<string, any> = {
      description: "",
      category: "General",
      style: "Cinematic",
      goal: "Storytelling",
      location: "Studio",
      action: "",
      structure: "Single Action",
      color: "#e6e1d6",
      settings: {},
    };
  for (const [k, v] of Object.entries(input)) {
    required(allowed.includes(k), "Unknown template field: " + k);
    if (k === "settings") {
      required(
        v && typeof v === "object" && !Array.isArray(v),
        "Settings must be an object.",
      );
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        required(
          KEYS.includes(sk) &&
            ["string", "number", "boolean"].includes(typeof sv) &&
            String(sv).length <= 12000,
          "Template settings cannot contain private IDs, files or nested data.",
        );
        if (FLAGS.includes(sk))
          required(
            typeof sv === "boolean",
            "Template toggles must be JSON booleans.",
          );
        if (sk === "outfit_mode")
          required(
            ["reference", "random"].includes(String(sv)),
            "Invalid outfit setting.",
          );
        if (sk === "camera_template")
          required(
            typeof sv === "string" && (sv === "" || Object.hasOwn(CAMERAS, sv)),
            "Invalid camera template.",
          );
      }
      t.settings = v;
    } else {
      required(
        typeof v === "string" && v.length <= 12000,
        "Invalid template text.",
      );
      t[k] = v.trim();
    }
  }
  required(
    t.name &&
      t.idea &&
      t.name.length <= 180 &&
      t.category.length <= 100 &&
      /^#[a-f\d]{6}$/i.test(t.color),
    "Template name, idea and valid color are required.",
  );
  return t;
}
export function allowed(t: Row, u: Row) {
  return (
    u.role === "admin" ||
    (t.status === "published" &&
      (t.access_tier === "free" || plan(u) === "premium"))
  );
}
export async function getTemplate(id: string, u: Row, c: DB = db()) {
  const t = await one("SELECT * FROM templates WHERE id=?", [id], c);
  required(t && allowed(t, u), "Template unavailable for your plan.", 404);
  return t;
}
export async function listTemplates(u: Row) {
  const all = await rows(
    "SELECT t.*,(SELECT id FROM template_files f WHERE f.template_id=t.id AND f.role='cover' ORDER BY id DESC LIMIT 1) AS cover_id FROM templates t WHERE t.is_system=1 AND t.status='published' ORDER BY t.id DESC",
  );
  return all
    .filter((t) => allowed(t, u))
    .map((t) => ({
      ...JSON.parse(t.config_json),
      id: String(t.id),
      access_tier: t.access_tier,
      cover_id: t.cover_id,
    }));
}
export async function applyTemplate(id: string, u: Row) {
  const paths: string[] = [];
  try {
    return await transaction(async (c) => {
      const account = await lockAccount(String(u.id), c),
        t = await getTemplate(id, u, c),
        config = JSON.parse(t.config_json);
      delete config.id;
      const clean = cleanTemplate(config),
        files = await rows(
          "SELECT * FROM template_files WHERE template_id=? AND role<>'cover'",
          [id],
          c,
        );
      await quota(
        account,
        "storage",
        files.reduce((n, f) => n + Number(f.file_size), 0),
        c,
      );
      const settings = { ...clean.settings };
      for (const f of files) {
        const stored = await cloneImage(f.storage_path, "uploads");
        paths.push(stored);
        const type = (
          {
            character: "character",
            product: "product",
            background: "scene",
            logo: "brand",
          } as Record<string, string>
        )[f.role];
        required(type, "Invalid template asset role.");
        const result = await run(
          "INSERT INTO assets(user_id,asset_type,original_filename,reference_name,stored_filename,storage_path,mime_type,file_size,width,height) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [
            u.id,
            type,
            f.original_filename,
            "PENDING_" + stored.split("/").at(-1),
            stored.split("/").at(-1),
            stored,
            f.mime_type,
            f.file_size,
            f.width,
            f.height,
          ],
          c,
        );
        const aid = String(result.insertId),
          alias = type.toUpperCase() + "_REF_" + aid;
        await run(
          "UPDATE assets SET reference_name=? WHERE id=?",
          [alias, aid],
          c,
        );
        if (["character", "product"].includes(type)) {
          const entry = await run(
            `INSERT INTO ${type === "product" ? "products" : "characters"}(user_id,name,reference_asset_id,description) VALUES (?,?,?,?)`,
            [
              u.id,
              f.original_filename.replace(/\.[^.]+$/, ""),
              aid,
              "Template example",
            ],
            c,
          );
          settings[type + "_id"] = String(entry.insertId);
        } else {
          const prefix = type === "scene" ? "background" : "logo";
          settings[prefix + "_asset_id"] = aid;
          settings[prefix + "_filename"] = f.original_filename;
          settings[prefix + "_alias"] = alias;
        }
      }
      await audit("template_used", id, String(u.id), c);
      return { ...clean, settings };
    });
  } catch (e) {
    await Promise.all(paths.map(removeFile));
    throw e;
  }
}
export async function attachTemplate(
  id: string,
  u: Row,
  role: string,
  file: File,
) {
  await getTemplate(id, u);
  required(
    ["cover", "character", "product", "background", "logo"].includes(role),
    "Invalid template asset role.",
  );
  const image = await storeImage(file, "templates");
  try {
    await run(
      "INSERT INTO template_files(template_id,role,original_filename,storage_path,mime_type,file_size,width,height) VALUES (?,?,?,?,?,?,?,?)",
      [
        id,
        role,
        image.name,
        image.stored,
        image.mime,
        file.size,
        image.width,
        image.height,
      ],
    );
    await audit("template_asset_added", id, String(u.id));
  } catch (e) {
    await removeFile(image.stored);
    throw e;
  }
}
export async function duplicateTemplate(id: string, u: Row) {
  const paths: string[] = [];
  try {
    return await transaction(async (c) => {
      const t = await getTemplate(id, u, c),
        config = JSON.parse(t.config_json);
      delete config.id;
      config.name = (t.name + " (copy)").slice(0, 180);
      const result = await run(
          "INSERT INTO templates(name,description,config_json,is_system,category,access_tier,status) VALUES (?,?,?,1,?,?,'draft')",
          [
            config.name,
            t.description,
            JSON.stringify(config),
            t.category,
            t.access_tier,
          ],
          c,
        ),
        newId = String(result.insertId);
      for (const f of await rows(
        "SELECT * FROM template_files WHERE template_id=?",
        [id],
        c,
      )) {
        const stored = await cloneImage(f.storage_path, "templates");
        paths.push(stored);
        await run(
          "INSERT INTO template_files(template_id,role,original_filename,storage_path,mime_type,file_size,width,height) VALUES (?,?,?,?,?,?,?,?)",
          [
            newId,
            f.role,
            f.original_filename,
            stored,
            f.mime_type,
            f.file_size,
            f.width,
            f.height,
          ],
          c,
        );
      }
      await audit("template_duplicated", newId, String(u.id), c);
      return newId;
    });
  } catch (e) {
    await Promise.all(paths.map(removeFile));
    throw e;
  }
}
