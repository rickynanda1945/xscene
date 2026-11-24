import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const name = "xscene_guest";
  if (request.cookies.has(name)) return NextResponse.next();
  const value = crypto.randomUUID() + crypto.randomUUID(),
    headers = new Headers(request.headers);
  headers.set(
    "cookie",
    (request.headers.get("cookie") || "") + `; ${name}=${value}`,
  );
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://"),
    path: "/",
    maxAge: 86400,
  });
  return response;
}
export const config = { matcher: ["/((?!_next|assets|favicon.ico).*)"] };
