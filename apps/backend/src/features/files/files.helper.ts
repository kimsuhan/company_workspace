import { basename, extname } from "node:path";

import type { UploadedFileInput } from "./files.type.js";

const MAX_UPLOAD_FILE_BYTES = 10_000_000;

export function readUploadedFileInput(input: unknown): UploadedFileInput {
  if (!input || typeof input !== "object") {
    throw new Error("file is required");
  }

  const values = input as Record<string, unknown>;
  const originalName = readRequiredString(values.name, "file name");
  const mimeType = readRequiredString(values.type, "mime type");
  const sizeBytes = Number(values.size);

  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
    throw new Error("file size must be a non-negative integer");
  }

  if (sizeBytes > MAX_UPLOAD_FILE_BYTES) {
    throw new Error("file is too large");
  }

  return { originalName, mimeType, sizeBytes };
}

export function buildStoredFileName(prefix: string, originalName: string): string {
  const safeExtension = extname(originalName).replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  const safeName = basename(originalName, extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${prefix}-${safeName || "file"}${safeExtension}`;
}

export function extractFileIdsFromContent(content: string): Set<number> {
  const ids = new Set<number>();

  for (const match of content.matchAll(/\/api\/files\/(\d+)(?:\/download)?\b/g)) {
    ids.add(Number(match[1]));
  }

  return ids;
}

export function findOrphanFileIds(activeFileIds: Iterable<number>, referencedFileIds: Set<number>): number[] {
  return Array.from(activeFileIds).filter((id) => !referencedFileIds.has(id));
}

export function readFileId(value: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("file id must be a positive integer");
  }

  return id;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid request";
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}
