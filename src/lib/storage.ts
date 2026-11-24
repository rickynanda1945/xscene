import {
  mkdir,
  writeFile,
  readFile,
  unlink,
  copyFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { required } from "./errors";
export function storageRoot() {
  return path.resolve(process.env.STORAGE_DIR || "storage");
}
export function storagePath(stored: string) {
  required(
    typeof stored === "string" && stored.startsWith("storage/"),
    "Invalid storage path.",
    404,
  );
  const file = path.resolve(storageRoot(), stored.slice(8));
  required(
    file.startsWith(storageRoot() + path.sep),
    "Invalid storage path.",
    404,
  );
  return file;
}
export async function exists(stored: string) {
  try {
    return (await stat(storagePath(stored))).isFile();
  } catch {
    return false;
  }
}
export async function imageFile(file: File) {
  required(
    file instanceof File && file.size > 0 && file.size <= 10485760,
    "Upload one PNG, JPG or WebP image up to 10 MB.",
  );
  const name = path.basename(file.name.replaceAll("\\", "/")).slice(0, 255),
    ext = path.extname(name).toLowerCase(),
    accepted: Record<string, string> = {
      ".png": "png",
      ".jpg": "jpeg",
      ".jpeg": "jpeg",
      ".webp": "webp",
    };
  required(accepted[ext], "Choose PNG, JPG or WebP.");
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const metadata = await sharp(buffer, {
      limitInputPixels: 50_000_000,
      failOn: "error",
    }).metadata();
    required(
      metadata.format === accepted[ext] &&
        metadata.width &&
        metadata.height &&
        metadata.width * metadata.height <= 50_000_000 &&
        !metadata.pages,
      "Choose a valid single-frame image under 50 megapixels.",
    );
    await sharp(buffer, { limitInputPixels: 50_000_000, failOn: "error" })
      .resize(1, 1)
      .toBuffer();
    return {
      buffer,
      name,
      ext: ext === ".jpeg" ? ".jpg" : ext,
      mime: "image/" + (metadata.format === "jpeg" ? "jpeg" : metadata.format),
      width: metadata.width,
      height: metadata.height,
    };
  } catch (e) {
    required(false, "Choose a valid PNG, JPG or WebP image.");
  }
}
export async function storeImage(file: File, folder: "uploads" | "templates") {
  const v = await imageFile(file),
    stored =
      "storage/" + folder + "/" + randomBytes(20).toString("hex") + v.ext;
  await mkdir(path.dirname(storagePath(stored)), { recursive: true });
  await writeFile(storagePath(stored), v.buffer, { flag: "wx", mode: 0o600 });
  return { ...v, stored };
}
export async function removeFile(stored: string) {
  await unlink(storagePath(stored)).catch(() => {});
}
export async function readImage(stored: string) {
  return readFile(storagePath(stored));
}
export async function cloneImage(
  stored: string,
  folder: "uploads" | "templates",
) {
  const target =
    "storage/" +
    folder +
    "/" +
    randomBytes(20).toString("hex") +
    path.extname(stored);
  await mkdir(path.dirname(storagePath(target)), { recursive: true });
  await copyFile(storagePath(stored), storagePath(target));
  return target;
}
