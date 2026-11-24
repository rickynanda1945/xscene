import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { seal, unseal, equal, emailAddress } from "../src/lib/auth";
import { storagePath } from "../src/lib/storage";
import { bodyBytes } from "../src/lib/errors";
process.env.AUTH_SECRET = randomBytes(32).toString("hex");
test("Sealed identity state rejects expiry and modification", () => {
  const value = seal({ state: "state", verifier: "private" });
  assert.equal(unseal(value)?.state, "state");
  const i = 20,
    tampered =
      value.slice(0, i) + (value[i] === "A" ? "B" : "A") + value.slice(i + 1);
  assert.equal(unseal(tampered), null);
  assert.equal(unseal(seal({ state: "old" }, -1)), null);
  assert(!value.includes("private"));
});
test("Comparison handles different lengths safely", () => {
  assert(equal("same", "same"));
  assert(!equal("a", "long"));
});
test("Private storage paths cannot escape their volume", () => {
  assert(storagePath("storage/uploads/safe.png").endsWith("/uploads/safe.png"));
  assert.throws(() => storagePath("storage/../../.env"));
  assert.throws(() => storagePath("/etc/passwd"));
});
test("Oversized streamed bodies are rejected before parsing", async () => {
  const request = new Request("http://localhost/test", {
    method: "POST",
    body: "x".repeat(100),
  });
  await assert.rejects(bodyBytes(request, 50));
});
test("PHP bcrypt password hashes remain verifiable", async () => {
  const password = randomBytes(16).toString("hex"),
    hash = await bcrypt.hash(password, 4),
    php = hash.replace(/^\$2b\$/, "$2y$");
  assert(await bcrypt.compare(password, php.replace(/^\$2y\$/, "$2b$")));
  assert(!(await bcrypt.compare("wrong", hash)));
});

test("Email validation rejects SMTP syntax and control characters", () => {
  assert.equal(
    emailAddress("Creator+tag@Example.com"),
    "creator+tag@example.com",
  );
  for (const email of [
    "a<b@example.com",
    "a,b@example.com",
    "a:b@example.com",
    "a\r\n@example.com",
    "a@-invalid.example",
  ])
    assert.throws(() => emailAddress(email));
});
