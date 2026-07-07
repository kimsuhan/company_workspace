import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "./db.js";
import { files, notes, projectNodes, projects, todoMemos } from "./schema.js";

const MAX_UPLOAD_FILE_BYTES = 10_000_000;
const ORPHAN_FILE_GRACE_MS = 60 * 60 * 1000;

type FileRow = typeof files.$inferSelect;

export type UploadedFileInput = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

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

export function registerFileRoutes(app: Hono): void {
  app.post("/api/files", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body.file;

      if (!(file instanceof File)) {
        throw new Error("file is required");
      }

      return c.json(await saveUploadedFile(file), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.get("/api/files/:id", async (c) => serveFile(c.req.param("id"), false));
  app.get("/api/files/:id/download", async (c) => serveFile(c.req.param("id"), true));
  app.delete("/api/files/:id", async (c) => {
    try {
      const deleted = await deleteFile(readFileId(c.req.param("id")));
      return deleted ? c.json({ ok: true }) : c.json({ error: "File not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}

export function startFileCleanup(): () => void {
  const task = cron.schedule("17 3 * * *", () => {
    cleanupOrphanFiles().catch((error: unknown) => {
      console.error(error);
    });
  });

  cleanupOrphanFiles().catch((error: unknown) => {
    console.error(error);
  });

  return () => task.stop();
}

export async function cleanupOrphanFiles(now = new Date()): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - ORPHAN_FILE_GRACE_MS);
  const [fileRows, referencedFileIds] = await Promise.all([listOldActiveFiles(cutoff), collectReferencedFileIds()]);
  const orphanIds = new Set(findOrphanFileIds(fileRows.map((file) => file.id), referencedFileIds));
  const orphanRows = fileRows.filter((file) => orphanIds.has(file.id));

  for (const file of orphanRows) {
    await deleteStoredFile(file.storagePath);
    await markFileInactive(file.id);
  }

  return { deleted: orphanRows.length };
}

async function saveUploadedFile(file: File): Promise<FileRow> {
  const input = readUploadedFileInput(file);
  const storedName = buildStoredFileName(randomUUID(), input.originalName);
  const storagePath = join(getUploadsFolder(), storedName);
  const publicUrl = `/api/files/pending`;
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(storagePath, Buffer.from(await file.arrayBuffer()));

  const [row] = await getDb()
    .insert(files)
    .values({
      ...input,
      storedName,
      storagePath,
      publicUrl,
    })
    .returning();

  const nextPublicUrl = `/api/files/${row.id}`;
  const [updated] = await getDb()
    .update(files)
    .set({ publicUrl: nextPublicUrl })
    .where(eq(files.id, row.id))
    .returning();

  return updated;
}

async function serveFile(value: string, download: boolean): Promise<Response> {
  try {
    const file = await findActiveFile(readFileId(value));

    if (!file) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    const headers = new Headers({
      "content-type": file.mimeType,
      "content-length": String(file.sizeBytes),
    });

    if (download) {
      headers.set("content-disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    }

    return new Response(await readFile(file.storagePath), { headers });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

async function deleteFile(id: number): Promise<boolean> {
  const row = await findActiveFile(id);

  if (!row) {
    return false;
  }

  await deleteStoredFile(row.storagePath);
  return markFileInactive(id);
}

async function markFileInactive(id: number): Promise<boolean> {
  const [row] = await getDb()
    .update(files)
    .set({ isActive: false })
    .where(and(eq(files.id, id), eq(files.isActive, true)))
    .returning();

  return Boolean(row);
}

async function deleteStoredFile(storagePath: string): Promise<void> {
  try {
    await unlink(storagePath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

async function listOldActiveFiles(cutoff: Date): Promise<FileRow[]> {
  const rows = await getDb().select().from(files).where(eq(files.isActive, true));

  return rows.filter((file) => file.createdAt < cutoff);
}

async function collectReferencedFileIds(): Promise<Set<number>> {
  const referencedFileIds = new Set<number>();
  const db = getDb();
  const activeProjects = await db.select({ id: projects.id, logoFileId: projects.logoFileId }).from(projects).where(eq(projects.isActive, true));
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));

  for (const project of activeProjects) {
    if (project.logoFileId) {
      referencedFileIds.add(project.logoFileId);
    }
  }

  const [todoRows, noteRows, projectNodeRows] = await Promise.all([
    db.select({ projectId: todoMemos.projectId, content: todoMemos.content }).from(todoMemos),
    db.select({ content: notes.content }).from(notes),
    db.select({ projectId: projectNodes.projectId, content: projectNodes.content }).from(projectNodes).where(eq(projectNodes.isActive, true)),
  ]);

  for (const row of todoRows) {
    if (activeProjectIds.has(row.projectId)) {
      addContentFileIds(referencedFileIds, row.content);
    }
  }

  for (const row of noteRows) {
    addContentFileIds(referencedFileIds, row.content);
  }

  for (const row of projectNodeRows) {
    if (activeProjectIds.has(row.projectId)) {
      addContentFileIds(referencedFileIds, row.content);
    }
  }

  return referencedFileIds;
}

function addContentFileIds(referencedFileIds: Set<number>, content: string): void {
  for (const id of extractFileIdsFromContent(content)) {
    referencedFileIds.add(id);
  }
}

export async function findActiveFile(id: number): Promise<FileRow | undefined> {
  const [file] = await getDb()
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.isActive, true)));

  return file;
}

function getUploadsFolder(): string {
  return join(dirname(dirname(fileURLToPath(import.meta.url))), "uploads", "files");
}

function readFileId(value: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("file id must be a positive integer");
  }

  return id;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid request";
}
