import { NextResponse } from "next/server";
import { appURL, checkCSRF, logout } from "@/lib/auth";
import { formBody, failure } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    await checkCSRF(request, await formBody(request, 65536));
    await logout();
    return NextResponse.redirect(new URL("/login", appURL()), 303);
  } catch (e) {
    return failure(e);
  }
}
