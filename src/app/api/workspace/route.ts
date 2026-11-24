import { cookies } from "next/headers";
import { requireUser, checkCSRF, rate, hash, SESSION } from "@/lib/auth";
import { success, failure, required, jsonBody, formBody } from "@/lib/errors";
import { db, one, rows, run, transaction, audit, setting } from "@/lib/db";
import { plan, canWrite, limits, lockAccount } from "@/lib/accounts";
import { MODELS } from "@/lib/prompts";
import { listTemplates, applyTemplate } from "@/lib/templates";
import { getProject, listProjects, saveOrGenerate } from "@/lib/projects";
import { library, uploadAsset, deleteLibrary } from "@/lib/library";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const WRITES = [
  "save",
  "delete",
  "generate",
  "upload",
  "brand_save",
  "library_delete",
  "template_apply",
  "revoke_sessions",
];
async function handle(request: Request) {
  try {
    const u = await requireUser(true),
      uid = String(u.id),
      url = new URL(request.url),
      action = url.searchParams.get("action") || "",
      page = Math.max(
        1,
        Math.min(100000, Math.floor(Number(url.searchParams.get("page")) || 1)),
      ),
      id = url.searchParams.get("id") || "0";
    let input: Record<string, any> = {},
      form: FormData | undefined;
    if (WRITES.includes(action)) {
      required(request.method === "POST", "Use POST for this action.", 405);
      if (request.headers.get("content-type")?.includes("multipart/form-data"))
        form = await formBody(request);
      else input = await jsonBody(request);
      await checkCSRF(request, form);
      await rate("writes:" + uid, 90, 60);
    } else required(request.method === "GET", "Use GET for this action.", 405);
    let data: any;
    switch (action) {
      case "bootstrap":
        data = {
          csrf: await (await import("@/lib/auth")).csrfToken(),
          templates: await listTemplates(u),
          user: {
            name: u.name,
            email: u.email,
            role: u.role,
            plan: plan(u),
            plan_until: u.plan_until,
            limits: await limits(u),
            can_write: canWrite(u),
          },
          models: await setting("models", MODELS),
          announcement: await setting("announcement", ""),
          warning: null,
        };
        break;
      case "projects":
        data = await listProjects(uid, page);
        break;
      case "project":
        data = await getProject(id, uid);
        break;
      case "save":
      case "generate":
        if (action === "generate") await rate("generate:" + uid, 20, 60);
        data = await saveOrGenerate(input, uid, action === "generate");
        break;
      case "delete":
        await transaction(async (c) => {
          await lockAccount(uid, c);
          await getProject(String(input.id), uid, c);
          await run(
            "DELETE FROM projects WHERE id=? AND user_id=?",
            [input.id, uid],
            c,
          );
          await audit("project_deleted", String(input.id), uid, c);
        });
        data = { deleted: true };
        break;
      case "library":
      case "library_item":
        data = await library(
          uid,
          url.searchParams.get("kind") || "",
          page,
          action === "library_item" ? id : undefined,
        );
        break;
      case "upload":
        await rate("upload:" + uid, 15, 60);
        required(form, "Use multipart form data.");
        data = await uploadAsset(
          uid,
          form.get("image") as File,
          String(form.get("type") || ""),
          String(form.get("name") || ""),
          String(form.get("description") || ""),
        );
        break;
      case "brand_save": {
        const keys = [
            "name",
            "description",
            "primary_colors",
            "secondary_colors",
            "visual_style",
            "tone",
            "brand_do",
            "brand_dont",
          ],
          values = keys.map((k) => {
            required(
              typeof (input[k] ?? "") === "string" &&
                String(input[k] || "").length <= 12000,
              "Invalid brand field.",
            );
            return String(input[k] || "").trim();
          });
        required(
          values[0] && values[0].length <= 180,
          "Brand name is required.",
        );
        data = await transaction(async (c) => {
          await lockAccount(uid, c);
          const r = await run(
            "INSERT INTO brands(user_id,name,description,primary_colors,secondary_colors,visual_style,tone,brand_do,brand_dont) VALUES (?,?,?,?,?,?,?,?,?)",
            [uid, ...values],
            c,
          );
          await audit("brand_saved", String(r.insertId), uid, c);
          return { id: String(r.insertId) };
        });
        break;
      }
      case "library_delete":
        await deleteLibrary(uid, String(input.kind), String(input.id));
        data = { deleted: true };
        break;
      case "history":
        data = await rows(
          "SELECT g.id,g.project_id,g.target_model,g.created_at,p.name FROM prompt_generations g JOIN projects p ON p.id=g.project_id WHERE p.user_id=? ORDER BY g.id DESC LIMIT 24 OFFSET " +
            (page - 1) * 24,
          [uid],
        );
        break;
      case "generation": {
        const r = await one(
          "SELECT g.* FROM prompt_generations g JOIN projects p ON p.id=g.project_id WHERE p.user_id=? AND g.id=?",
          [uid, id],
        );
        required(r, "Prompt unavailable.", 404);
        r.shots = JSON.parse(r.shots_json);
        r.project_snapshot = r.project_snapshot_json
          ? JSON.parse(r.project_snapshot_json)
          : null;
        delete r.shots_json;
        delete r.project_snapshot_json;
        data = r;
        break;
      }
      case "template_apply":
        data = await applyTemplate(String(input.id), u);
        break;
      case "sessions":
        data = await rows(
          "SELECT created_at,last_seen,expires_at FROM auth_sessions WHERE user_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY last_seen DESC",
          [uid],
        );
        break;
      case "revoke_sessions":
        await run(
          "DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?",
          [uid, hash((await cookies()).get(SESSION)?.value || "")],
        );
        data = { revoked: true };
        await audit("other_sessions_revoked", "", uid);
        break;
      default:
        required(false, "Endpoint not found.", 404);
    }
    return success(data);
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
