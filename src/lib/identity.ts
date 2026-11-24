import { cookies } from "next/headers";
import { randomBytes, randomInt } from "node:crypto";
import { one, run, transaction } from "./db";
import {
  cookieOptions,
  seal,
  unseal,
  hmac,
  equal,
  rate,
  emailAddress,
  publicIdentity,
  startSession,
} from "./auth";
import { sendCode } from "./mail";
import { required } from "./errors";
export async function requestCode(raw: unknown) {
  const email = emailAddress(raw);
  await rate("otp-resend:" + email, 1, 60);
  await rate("otp-email:" + email, 6, 3600);
  const id = randomBytes(32).toString("hex"),
    code = String(randomInt(100000, 1000000));
  await transaction(async (c) => {
    await run(
      "UPDATE otp_challenges SET consumed_at=UTC_TIMESTAMP() WHERE email=? AND purpose='user' AND consumed_at IS NULL",
      [email],
      c,
    );
    await run(
      "INSERT INTO otp_challenges(id,email,code_hash,purpose,created_at,expires_at) VALUES (?,?,?,'user',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))",
      [id, email, hmac(id + ":" + code)],
      c,
    );
  });
  try {
    await sendCode(email, code);
  } catch (e) {
    await run(
      "UPDATE otp_challenges SET consumed_at=UTC_TIMESTAMP() WHERE id=?",
      [id],
    );
    throw e;
  }
  (await cookies()).set("xscene_otp", seal({ id, email }, 300), {
    ...cookieOptions(),
    maxAge: 300,
  });
}
export async function verifyCode(value: unknown) {
  const pending = unseal((await cookies()).get("xscene_otp")?.value);
  required(pending?.id, "Your code expired. Request a new code.");
  const code = String(value || "").trim();
  required(/^\d{6}$/.test(code), "Enter the six-digit code.");
  await rate("otp-verify:" + pending.id, 8, 300);
  const result = await transaction(async (c) => {
    const challenge = await one(
      "SELECT *,expires_at>UTC_TIMESTAMP() AS valid FROM otp_challenges WHERE id=? AND purpose='user' FOR UPDATE",
      [pending.id],
      c,
    );
    if (
      !challenge ||
      !challenge.valid ||
      challenge.consumed_at ||
      Number(challenge.attempts) >= 5
    )
      return null;
    await run(
      "UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?",
      [pending.id],
      c,
    );
    if (!equal(hmac(pending.id + ":" + code), challenge.code_hash)) return null;
    await run(
      "UPDATE otp_challenges SET consumed_at=UTC_TIMESTAMP() WHERE id=?",
      [pending.id],
      c,
    );
    return publicIdentity(challenge.email, null, c);
  });
  required(result, "Invalid or expired code. Request a new code if needed.");
  await startSession(result, "email_otp");
  return result;
}
