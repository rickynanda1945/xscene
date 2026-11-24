import { one, rows, run, setSetting, transaction, audit, type Row } from "./db";
import {
  cleanTemplate,
  getTemplate,
  attachTemplate,
  duplicateTemplate,
} from "./templates";
import { required } from "./errors";
import { archiveAsset } from "./library";
import { removeFile } from "./storage";
import { MODELS } from "./prompts";
export const LIMIT_KEYS = [
  "free_projects",
  "premium_projects",
  "free_prompts",
  "premium_prompts",
  "free_storage_mb",
  "premium_storage_mb",
];
export async function adminAction(
  u: Row,
  input: Record<string, any>,
  files: Record<string, File> = {},
) {
  const action = String(input.action || ""),
    id = String(input.id || "0"),
    uid = String(u.id);
  required(u.role === "admin", "Administrator access required.", 403);
  switch (action) {
    case "user_update": {
      required(
        ["active", "disabled"].includes(input.status) &&
          ["free", "premium"].includes(input.plan),
        "Invalid account settings.",
      );
      required(
        await one("SELECT id FROM users WHERE id=? AND role='user'", [id]),
        "User unavailable.",
        404,
      );
      const until = String(input.plan_until || "");
      required(
        !until ||
          (/^\d{4}-\d{2}-\d{2}$/.test(until) &&
            !Number.isNaN(Date.parse(until)) &&
            new Date(until).toISOString().slice(0, 10) === until),
        "Invalid plan expiry date.",
      );
      await transaction(async (c) => {
        await run(
          "UPDATE users SET status=?,plan=?,plan_until=? WHERE id=? AND role='user'",
          [input.status, input.plan, until ? until + " 23:59:59" : null, id],
          c,
        );
        if (input.status === "disabled")
          await run("DELETE FROM auth_sessions WHERE user_id=?", [id], c);
        await audit("user_updated", id, uid, c);
      });
      break;
    }
    case "revoke":
      required(input.confirm === "yes", "Confirm session revocation.");
      await run("DELETE FROM auth_sessions WHERE user_id=?", [id]);
      await audit("sessions_revoked", id, uid);
      break;
    case "template_save":
    case "template_import":
    case "template_preview": {
      let raw = String(input.config_json || "");
      if (action === "template_import") {
        const file = files.template;
        required(
          file &&
            file.size <= 131072 &&
            file.name.toLowerCase().endsWith(".json"),
          "Upload one JSON template under 128 KB.",
        );
        raw = await file.text();
      }
      required(Buffer.byteLength(raw) <= 131072, "Template exceeds 128 KB.");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        required(false, "Invalid template JSON.");
      }
      required(
        parsed && typeof parsed === "object" && !Array.isArray(parsed),
        "Template must be a JSON object.",
      );
      delete parsed.id;
      const t = cleanTemplate(parsed);
      if (action === "template_preview")
        return { message: "Preview ready. Nothing published.", preview: t };
      const status =
          action === "template_import"
            ? "draft"
            : String(input.status || "draft"),
        tier = String(input.access_tier || "free");
      required(
        ["draft", "published", "disabled"].includes(status) &&
          ["free", "premium"].includes(tier),
        "Invalid template status or tier.",
      );
      const values = [
        t.name,
        t.description,
        JSON.stringify(t),
        t.category,
        tier,
        status,
      ];
      let savedId = id;
      if (id !== "0" && action !== "template_import") {
        await getTemplate(id, u);
        await run(
          "UPDATE templates SET name=?,description=?,config_json=?,category=?,access_tier=?,status=?,is_system=1 WHERE id=?",
          [...values, id],
        );
      } else
        savedId = String(
          (
            await run(
              "INSERT INTO templates(name,description,config_json,category,access_tier,status,is_system) VALUES (?,?,?,?,?,?,1)",
              values,
            )
          ).insertId,
        );
      await audit("template_saved", savedId, uid);
      return { message: "Template saved.", id: savedId };
    }
    case "template_asset":
      required(files.image, "Choose an image.");
      await attachTemplate(id, u, String(input.role), files.image);
      return { message: "Template image added.", id };
    case "template_asset_delete": {
      required(input.confirm === "yes", "Confirm image removal.");
      const f = await one("SELECT * FROM template_files WHERE id=?", [id]);
      required(f, "Image unavailable.", 404);
      await run("DELETE FROM template_files WHERE id=?", [id]);
      if (
        !(await one("SELECT id FROM template_files WHERE storage_path=?", [
          f.storage_path,
        ]))
      )
        await removeFile(f.storage_path);
      await audit("template_asset_deleted", id, uid);
      return { message: "Template image removed.", id: String(f.template_id) };
    }
    case "template_duplicate":
      return {
        message: "Draft copy created.",
        id: await duplicateTemplate(id, u),
      };
    case "template_delete": {
      required(input.confirm === "yes", "Confirm template deletion.");
      const files = await rows(
        "SELECT storage_path FROM template_files WHERE template_id=?",
        [id],
      );
      await run("DELETE FROM templates WHERE id=?", [id]);
      for (const f of files)
        if (
          !(await one("SELECT id FROM template_files WHERE storage_path=?", [
            f.storage_path,
          ]))
        )
          await removeFile(f.storage_path);
      await audit("template_deleted", id, uid);
      break;
    }
    case "asset_archive": {
      required(input.confirm === "yes", "Confirm library removal.");
      const asset = await one("SELECT user_id FROM assets WHERE id=?", [id]);
      required(asset, "Asset unavailable.", 404);
      await archiveAsset(String(asset.user_id), id);
      await audit("admin_asset_archived", id, uid);
      break;
    }
    case "settings_save": {
      const values: Record<string, unknown> = {};
      for (const key of LIMIT_KEYS) {
        const v = Number(input[key]);
        required(
          Number.isInteger(v) && v >= 0 && v <= 100000,
          "Limits must be from 0 to 100000.",
        );
        values[key] = v;
      }
      const models = Array.isArray(input.models)
        ? input.models
        : [input.models];
      required(
        models.length && models.every((v: string) => MODELS.includes(v)),
        "Select supported video models.",
      );
      values.models = models;
      await transaction(async (c) => {
        for (const [k, v] of Object.entries(values)) await setSetting(k, v, c);
        await audit("settings_updated", "Plan limits and models", uid, c);
      });
      break;
    }
    case "announcement_save":
      required(
        String(input.announcement || "").length <= 2000,
        "Announcement must be under 2000 characters.",
      );
      await setSetting("announcement", String(input.announcement || "").trim());
      await audit("announcement_updated", "", uid);
      break;
    default:
      required(false, "Unknown administrator action.");
  }
  return { message: "Changes saved." };
}
