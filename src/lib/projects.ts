import {
  db,
  one,
  rows,
  run,
  transaction,
  type DB,
  type Row,
  audit,
  setting,
} from "./db";
import { required } from "./errors";
import {
  buildPrompt,
  cleanProject,
  type Project,
  type Reference,
  MODELS,
} from "./prompts";
import { lockAccount, quota } from "./accounts";
import { exists } from "./storage";
export async function getProject(id: string, uid: string, c: DB = db()) {
  const p = await one(
    "SELECT p.*,s.config_json FROM projects p JOIN project_settings s ON s.project_id=p.id WHERE p.id=? AND p.user_id=?",
    [id, uid],
    c,
  );
  required(p, "Project not found.", 404);
  p.settings = JSON.parse(p.config_json);
  delete p.config_json;
  return p as Row & Project;
}
export async function references(p: Project, uid: string, c: DB = db()) {
  const refs: Reference[] = [];
  for (const [key, table] of Object.entries({
    character_id: "characters",
    product_id: "products",
    brand_id: "brands",
  })) {
    const id = p.settings[key];
    if (!id) continue;
    const entry = await one(
      `SELECT * FROM ${table} WHERE id=? AND user_id=?`,
      [id, uid],
      c,
    );
    required(
      entry,
      "Reference unavailable. Choose an item from your own library.",
    );
    if (table === "brands") continue;
    const a = await one(
      "SELECT * FROM assets WHERE id=? AND user_id=?",
      [entry.reference_asset_id, uid],
      c,
    );
    required(
      a && (await exists(a.storage_path)),
      "Reference image unavailable.",
    );
    a.asset_type = a.asset_type.replace(/^archived_/, "");
    refs.push(a as Reference);
  }
  for (const [key, type] of Object.entries({
    background_asset_id: "scene",
    logo_asset_id: "brand",
  })) {
    if (!p.settings[key]) continue;
    const a = await one(
      "SELECT * FROM assets WHERE id=? AND user_id=? AND asset_type IN (?,?)",
      [p.settings[key], uid, type, "archived_" + type],
      c,
    );
    required(
      a && (await exists(a.storage_path)),
      "Reference unavailable. Choose an item from your own library.",
    );
    a.asset_type = type;
    refs.push(a as Reference);
  }
  return refs;
}
export async function saveOrGenerate(
  input: Record<string, any>,
  uid: string,
  generate: boolean,
) {
  const p = cleanProject(input),
    models = await setting("models", MODELS);
  required(
    models.includes(p.ai_video_model),
    "This video model is not enabled.",
  );
  return transaction(async (c) => {
    const u = await lockAccount(uid, c),
      refs = await references(p, uid, c);
    if (input.id) await getProject(String(input.id), uid, c);
    else await quota(u, "projects", 1, c);
    if (generate) await quota(u, "prompts", 1, c);
    let id = String(input.id || "");
    const values = [
      p.name,
      p.video_idea,
      p.video_goal,
      p.mode,
      p.duration,
      p.aspect_ratio,
      p.platform,
      p.ai_video_model,
    ];
    if (id)
      await run(
        "UPDATE projects SET name=?,video_idea=?,video_goal=?,mode=?,duration=?,aspect_ratio=?,platform=?,ai_video_model=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?",
        [...values, id, uid],
        c,
      );
    else
      id = String(
        (
          await run(
            "INSERT INTO projects(name,video_idea,video_goal,mode,duration,aspect_ratio,platform,ai_video_model,user_id) VALUES (?,?,?,?,?,?,?,?,?)",
            [...values, uid],
            c,
          )
        ).insertId,
      );
    await run(
      "INSERT INTO project_settings(project_id,config_json,character_id,brand_id,product_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json),character_id=VALUES(character_id),brand_id=VALUES(brand_id),product_id=VALUES(product_id)",
      [
        id,
        JSON.stringify(p.settings),
        p.settings.character_id || null,
        p.settings.brand_id || null,
        p.settings.product_id || null,
      ],
      c,
    );
    const project = await getProject(id, uid, c);
    if (!generate) {
      await audit("project_saved", id, uid, c);
      return project;
    }
    const brand = p.settings.brand_id
        ? await one(
            "SELECT * FROM brands WHERE id=? AND user_id=?",
            [p.settings.brand_id, uid],
            c,
          )
        : null,
      result = buildPrompt(p, refs, brand || null);
    const r = await run(
      "INSERT INTO prompt_generations(project_id,master_prompt,short_prompt,negative_prompt,shots_json,target_model,project_snapshot_json) VALUES (?,?,?,?,?,?,?)",
      [
        id,
        result.master_prompt,
        result.short_prompt,
        result.negative_prompt,
        JSON.stringify(result.shots),
        p.ai_video_model,
        JSON.stringify(project),
      ],
      c,
    );
    await run(
      "UPDATE projects SET status='ready' WHERE id=? AND user_id=?",
      [id, uid],
      c,
    );
    project.status = "ready";
    await audit("prompt_generated", id, uid, c);
    return {
      project,
      result,
      references: refs.map((a) => ({
        reference_name: a.reference_name,
        original_filename: a.original_filename,
      })),
      generation_id: String(r.insertId),
    };
  });
}
export async function listProjects(uid: string, page: number) {
  return rows(
    "SELECT id,name,video_idea,status,video_goal,duration,aspect_ratio,platform,ai_video_model,updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 24 OFFSET " +
      (page - 1) * 24,
    [uid],
  );
}
