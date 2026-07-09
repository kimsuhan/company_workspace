import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "../../common/db.js";
import { files, notes, projectNodes, projects, todoMemos, workspaceUsers } from "../../common/schema.js";
import { buildStoredFileName, extractFileIdsFromContent, findOrphanFileIds, readUploadedFileInput } from "./files.helper.js";
import type { FileRow } from "./files.type.js";

const ORPHAN_FILE_GRACE_MS = 60 * 60 * 1000;

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

export async function saveUploadedFile(file: File): Promise<FileRow> {
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

export async function deleteFile(id: number): Promise<boolean> {
  const row = await findActiveFile(id);

  if (!row) {
    return false;
  }

  await deleteStoredFile(row.storagePath);
  return markFileInactive(id);
}

export async function findActiveFile(id: number): Promise<FileRow | undefined> {
  const [file] = await getDb()
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.isActive, true)));

  return file;
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
  const activeUsers = await db
    .select({ profileImageFileId: workspaceUsers.profileImageFileId })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.isActive, true));
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));

  for (const project of activeProjects) {
    if (project.logoFileId) {
      referencedFileIds.add(project.logoFileId);
    }
  }

  for (const user of activeUsers) {
    if (user.profileImageFileId) {
      referencedFileIds.add(user.profileImageFileId);
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

function getUploadsFolder(): string {
  const backendRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

  return join(backendRoot, "uploads", "files");
}
