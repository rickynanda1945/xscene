import { randomBytes } from "node:crypto";
console.log("AUTH_SECRET=" + randomBytes(32).toString("hex"));
console.log("SETUP_TOKEN=" + randomBytes(32).toString("hex"));
