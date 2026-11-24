import { requireUser } from "./auth";
import { one } from "./db";
import { getTemplate } from "./templates";
import { required, failure } from "./errors";
import { readImage } from "./storage";
export async function media(request: Request, template = false) {
  try {
    const u = await requireUser(true),
      url = new URL(request.url),
      id = url.searchParams.get("id") || "0";
    let f;
    if (template) {
      f = await one("SELECT * FROM template_files WHERE id=?", [id]);
      required(f, "Image unavailable.", 404);
      await getTemplate(String(f.template_id), u);
    } else {
      const admin =
        u.role === "admin" && url.searchParams.get("scope") === "admin";
      f = await one(
        "SELECT * FROM assets WHERE id=?" + (admin ? "" : " AND user_id=?"),
        admin ? [id] : [id, u.id],
      );
      required(f, "Image unavailable.", 404);
    }
    required(
      ["image/png", "image/jpeg", "image/webp"].includes(f.mime_type),
      "Invalid image type.",
      404,
    );
    const bytes = await readImage(f.storage_path).catch(() => null);
    required(bytes, "Image unavailable.", 404);
    return new Response(bytes, {
      headers: {
        "Content-Type": f.mime_type,
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
