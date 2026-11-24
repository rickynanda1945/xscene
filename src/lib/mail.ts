import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { hash } from "./auth";
import { AppError, required } from "./errors";
export async function sendCode(email: string, code: string) {
  const transport = process.env.MAIL_TRANSPORT || "resend",
    from = process.env.MAIL_FROM || "",
    text = `Your XSCENE verification code is: ${code}\n\nThis code expires in 5 minutes and can only be used once. If you did not request it, ignore this message.`;
  if (transport === "test") {
    required(
      process.env.XSCENE_TEST_MODE === "true" &&
        process.env.NODE_ENV !== "production",
      "Test mail is disabled.",
      503,
    );
    const dir = process.env.TEST_MAIL_DIR;
    required(
      dir && path.isAbsolute(dir),
      "Configure an external TEST_MAIL_DIR.",
      503,
    );
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, hash(email) + ".json"),
      JSON.stringify({ email, code }),
      { mode: 0o600 },
    );
    return;
  }
  required(from && !/[\r\n]/.test(from), "Configure MAIL_FROM.", 503);
  if (transport === "resend") {
    required(process.env.RESEND_API_KEY, "Configure RESEND_API_KEY.", 503);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your XSCENE sign-in code",
        text,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new AppError(
        "Email delivery is unavailable. Please try again later.",
        503,
      );
  } else if (transport === "smtp") {
    const smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== "false",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 15000,
      socketTimeout: 15000,
    });
    await smtp.sendMail({
      from,
      to: email,
      subject: "Your XSCENE sign-in code",
      text,
    });
  } else throw new AppError("Email delivery is not configured.", 503);
}
