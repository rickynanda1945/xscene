export class AppError extends Error {
  constructor(
    message: string,
    public status = 422,
    public code = "VALIDATION_ERROR",
  ) {
    super(message);
  }
}
export function required(
  condition: unknown,
  message: string,
  status = 422,
): asserts condition {
  if (!condition) throw new AppError(message, status);
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "XSCENE request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Service is unavailable. Please try again or contact support.",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export function success(data: unknown) {
  return Response.json(
    { success: true, data },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
export async function jsonBody(request: Request, max = 150000) {
  const text = Buffer.from(await bodyBytes(request, max)).toString();
  try {
    const value = JSON.parse(text);
    required(
      value && typeof value === "object" && !Array.isArray(value),
      "Invalid request.",
    );
    return value as Record<string, any>;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Invalid JSON request.");
  }
}
export async function bodyBytes(request: Request, max = 12 * 1024 * 1024) {
  required(
    Number(request.headers.get("content-length") || 0) <= max,
    "Request is too large.",
    413,
  );
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}
export async function formBody(request: Request, max = 12 * 1024 * 1024) {
  const data = await bodyBytes(request, max);
  return new Response(data, {
    headers: {
      "Content-Type":
        request.headers.get("content-type") ||
        "application/x-www-form-urlencoded",
    },
  }).formData();
}
