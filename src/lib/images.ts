import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "@/db";
import { blobStore } from "@/db/schema";
import { IMAGE_LIMITS } from "@/lib/config";

/**
 * Image ingest.
 *
 * Uploads accept a file of any size — a parent photographing a Lego box with a
 * modern phone produces a 6 MB HEIC, and asking them to resize it first is the
 * kind of friction that makes people stop using the app. The server downscales,
 * re-encodes to WebP, and stores only the derivative; the original is discarded.
 *
 * Derivatives live inside SQLite rather than on disk so that "back up the
 * database" remains literally true — one file, no orphaned image directory to
 * restore alongside it.
 */

export type ImageKind = "avatar" | "goal";

export async function storeImage(
  householdId: string,
  input: Buffer,
  kind: ImageKind,
): Promise<string> {
  const maxEdge =
    kind === "avatar" ? IMAGE_LIMITS.avatarMaxEdge : IMAGE_LIMITS.goalMaxEdge;

  let quality = IMAGE_LIMITS.quality;
  let output = await encode(input, maxEdge, quality);

  // Re-encode at declining quality rather than rejecting the upload. A photo
  // that lands slightly over budget should still work.
  while (output.data.byteLength > IMAGE_LIMITS.maxStoredBytes && quality > 40) {
    quality -= 15;
    output = await encode(input, maxEdge, quality);
  }

  const bytes = Buffer.from(output.data);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // Identical bytes are stored once. Two children sharing a goal photo, or the
  // same image re-uploaded, should not duplicate it in the backup.
  const existing = db
    .select({ id: blobStore.id })
    .from(blobStore)
    .where(eq(blobStore.sha256, sha256))
    .get();
  if (existing) return existing.id;

  const row = db
    .insert(blobStore)
    .values({
      householdId,
      mime: "image/webp",
      bytes,
      width: output.info.width,
      height: output.info.height,
      byteSize: bytes.byteLength,
      sha256,
    })
    .returning({ id: blobStore.id })
    .get();

  return row.id;
}

async function encode(input: Buffer, maxEdge: number, quality: number) {
  return sharp(input, { failOn: "none" })
    .rotate() // honour EXIF orientation before it is stripped
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
}

export function getImage(id: string) {
  return db.select().from(blobStore).where(eq(blobStore.id, id)).get() ?? null;
}

export const ACCEPTED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/gif",
];
