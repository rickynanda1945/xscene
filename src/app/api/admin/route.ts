import { NextResponse } from "next/server";
import { requireAdmin, checkCSRF, appURL, rate } from "@/lib/auth";
import { formBody, jsonBody, success, failure, AppError } from "@/lib/errors";
import { adminAction } from "@/lib/admin";
import { rows, audit } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let tab = "overview";
  try {
    const u = await requireAdmin(true),
      isJSON = request.headers
        .get("content-type")
        ?.includes("application/json");
    let input: Record<string, any>,
      files: Record<string, File> = {};
    if (isJSON) {
      input = await jsonBody(request);
    } else {
      const form = await formBody(request);
      await checkCSRF(request, form);
      input = {};
      for (const [k, v] of form.entries()) {
        if (v instanceof File) files[k] = v;
        else if (k === "models") input.models = form.getAll("models");
        else input[k] = v;
      }
    }
    if (isJSON) await checkCSRF(request);
    await rate("admin-writes:" + u.id, 90, 60);
    tab = [
      "overview",
      "users",
      "plans",
      "templates",
      "assets",
      "security",
      "logs",
      "backup",
      "settings",
      "announcements",
    ].includes(input.tab)
      ? input.tab
      : "overview";
    if (input.action === "export_metadata") {
      const data: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        notice: "Metadata only. Back up MySQL and STORAGE_DIR separately.",
      };
      data.users = await rows(
        "SELECT id,name,email,role,status,plan,plan_until,email_verified_at,created_at FROM users",
      );
      for (const table of [
        "projects",
        "project_settings",
        "assets",
        "characters",
        "products",
        "brands",
        "templates",
        "template_files",
        "prompt_generations",
        "app_settings",
      ])
        data[table] = await rows("SELECT * FROM " + table);
      await audit("metadata_export", "", String(u.id));
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": 'attachment; filename="xscene-metadata.json"',
          "Cache-Control": "no-store",
        },
      });
    }
    const result = await adminAction(u, input, files);
    if (isJSON || request.headers.get("accept") === "application/json")
      return success(result);
    const to = new URL("/admin", appURL());
    to.searchParams.set("tab", tab);
    to.searchParams.set("notice", result.message);
    if (result.id) to.searchParams.set("edit", result.id);
    if (result.preview)
      return new Response(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Template preview</title><body><h1>Template preview</h1><pre>' +
          JSON.stringify(result.preview, null, 2)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;") +
          '</pre><a href="/admin?tab=templates">Back to templates</a></body></html>',
        {
          headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        },
      );
    return NextResponse.redirect(to, 303);
  } catch (e) {
    if (
      request.headers.get("content-type")?.includes("application/json") ||
      request.headers.get("accept") === "application/json"
    )
      return failure(e);
    const to = new URL("/admin", appURL());
    to.searchParams.set("tab", tab);
    to.searchParams.set(
      "error",
      e instanceof AppError
        ? e.message
        : "Unable to save changes. Check the service configuration.",
    );
    return NextResponse.redirect(to, 303);
  }
}
