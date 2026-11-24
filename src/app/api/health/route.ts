import { one } from "@/lib/db";
import release from "@/lib/release.json";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await one("SELECT 1 AS ok");
    return Response.json(
      { status: "ok", release: release.version },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
