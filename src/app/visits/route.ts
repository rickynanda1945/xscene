import { cookies } from "next/headers";
import { checkCSRF, currentUser, hash, rate } from "@/lib/auth";
import { formBody, failure } from "@/lib/errors";
import { run } from "@/lib/db";
export async function POST(request: Request) {
  try {
    const form = await formBody(request, 4096);
    await checkCSRF(request, form);
    const jar = await cookies();
    if (jar.get("xscene_analytics")?.value !== "yes")
      return new Response(null, { status: 204 });
    const u = await currentUser();
    await rate(
      "visits:" + (u?.id || jar.get("xscene_guest")?.value || "unknown"),
      300,
      3600,
    );
    const path = String(form.get("path") || "");
    if (
      [
        "dashboard",
        "create",
        "projects",
        "characters",
        "products",
        "brands",
        "backgrounds",
        "assets",
        "templates",
        "history",
        "settings",
      ].includes(path)
    )
      await run(
        "INSERT INTO visit_events(visitor_hash,path,source,created_at) VALUES (?,?,'direct',UTC_TIMESTAMP())",
        [hash(jar.get("xscene_guest")?.value || ""), path],
      );
    return new Response(null, { status: 204 });
  } catch (e) {
    return failure(e);
  }
}
