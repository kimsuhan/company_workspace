import type { Hono } from "hono";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "./db.js";
import { findActiveFile } from "./files.js";
import { projectHealthRecords, projectNodes, projects } from "./schema.js";

type ProjectRow = typeof projects.$inferSelect;
type ProjectHealthRecordRow = typeof projectHealthRecords.$inferSelect;
export type ProjectNodeRow = typeof projectNodes.$inferSelect;
type ProjectNodeType = "folder" | "document";
type ProjectHealthStatus = "healthy" | "unhealthy";
type LogoVariant = "black" | "white";
type ProjectHealthFetch = (input: string, init: { signal: AbortSignal }) => Promise<Response>;

const CHECK_TIMEOUT_MS = 10_000;
const HISTORY_LIMIT = 60;
const SSE_HEARTBEAT_MS = 25_000;

export type Project = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoFileId: number | null;
  logoVariant: LogoVariant;
  healthApiUrl: string | null;
  health: ProjectHealth | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectHealth = {
  status: ProjectHealthStatus;
  checkedAt: string;
  responseTimeMs: number | null;
  history: ProjectHealthRecord[];
};

export type ProjectHealthRecord = {
  checkedAt: string;
  status: ProjectHealthStatus;
  responseTimeMs: number | null;
};

type ProjectHealthResult = {
  status: ProjectHealthStatus;
  responseTimeMs: number | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: Date;
};

const projectSseClients = new Set<ReadableStreamDefaultController<string>>();
let isPollingProjectHealth = false;

export type ProjectNode = {
  id: number;
  projectId: number;
  parentId: number | null;
  type: ProjectNodeType;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: ProjectNode[];
};

export function readProjectInput(input: unknown): {
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoFileId: number | null;
  logoVariant: LogoVariant;
  healthApiUrl: string | null;
} {
  const values = readObject(input);

  return {
    name: readRequiredString(values.name, "name"),
    description: readOptionalString(values.description),
    logoUrl: readOptionalLogoUrl(values.logoUrl, "logoUrl"),
    logoFileId: readOptionalPositiveInteger(values.logoFileId, "logoFileId"),
    logoVariant: readLogoVariant(values.logoVariant),
    healthApiUrl: readOptionalHttpUrl(values.healthApiUrl, "healthApiUrl"),
  };
}

export function readProjectHealthTestInput(input: unknown): { healthApiUrl: string } {
  const values = readObject(input);

  return { healthApiUrl: readHttpUrl(values.healthApiUrl, "healthApiUrl") };
}

export function readProjectNodeInput(input: unknown): {
  type: ProjectNodeType;
  title: string;
  parentId: number | null;
  content: string;
} {
  const values = readObject(input);
  const type = readProjectNodeType(values.type);

  return {
    type,
    title: readRequiredString(values.title, "title"),
    parentId: readOptionalPositiveInteger(values.parentId, "parentId"),
    content: type === "document" ? readOptionalString(values.content) ?? "" : "",
  };
}

export function readProjectNodeMoveInput(input: unknown): { parentId: number | null; sortOrder: number } {
  const values = readObject(input);

  return {
    parentId: readOptionalPositiveInteger(values.parentId, "parentId"),
    sortOrder: readNonNegativeInteger(values.sortOrder, "sortOrder"),
  };
}

export function buildProjectNodeTree(rows: ProjectNodeRow[]): ProjectNode[] {
  const activeRows = rows.filter((row) => row.isActive);
  const nodes = new Map(activeRows.map((row) => [row.id, mapProjectNode(row)]));
  const roots: ProjectNode[] = [];

  for (const row of activeRows) {
    const node = nodes.get(row.id);

    if (!node) {
      continue;
    }

    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sortProjectNodes(roots);
  return roots;
}

export function isDescendantProjectNode(rows: ProjectNodeRow[], sourceNodeId: number, targetParentId: number | null): boolean {
  if (targetParentId === null) {
    return false;
  }

  let currentParentId: number | null = targetParentId;

  while (currentParentId !== null) {
    if (currentParentId === sourceNodeId) {
      return true;
    }

    currentParentId = rows.find((row) => row.id === currentParentId)?.parentId ?? null;
  }

  return false;
}

export async function listProjects(): Promise<Project[]> {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(eq(projects.isActive, true))
    .orderBy(asc(projects.createdAt));

  return Promise.all(rows.map(mapProject));
}

export async function createProject(input: unknown): Promise<Project> {
  const values = readProjectInput(input);
  const now = new Date();
  const [row] = await getDb()
    .insert(projects)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning();

  await runProjectHealth(row);
  await broadcastProjects();

  return mapProject(row);
}

export async function updateProject(id: number, input: unknown): Promise<Project | undefined> {
  const values = readProjectInput(input);
  const [row] = await getDb()
    .update(projects)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.isActive, true)))
    .returning();

  if (!row) {
    return undefined;
  }

  await runProjectHealth(row);
  await broadcastProjects();

  return mapProject(row);
}

export async function deleteProject(id: number): Promise<boolean> {
  const [row] = await getDb()
    .update(projects)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.isActive, true)))
    .returning();

  if (row) {
    await broadcastProjects();
  }

  return Boolean(row);
}

export async function checkProjectHealth(
  project: Pick<ProjectRow, "healthApiUrl">,
  fetcher: ProjectHealthFetch = fetch,
  now = () => Date.now(),
): Promise<ProjectHealthResult> {
  if (!project.healthApiUrl) {
    throw new Error("healthApiUrl is required");
  }

  const startedAt = now();
  const checkedAt = new Date(startedAt);

  try {
    const response = await fetcher(project.healthApiUrl, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    const responseTimeMs = Math.max(0, now() - startedAt);

    return {
      checkedAt,
      status: response.ok ? "healthy" : "unhealthy",
      responseTimeMs,
      statusCode: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      checkedAt,
      status: "unhealthy",
      responseTimeMs: null,
      statusCode: null,
      error: getErrorMessage(error),
    };
  }
}

export async function runProjectHealth(project: ProjectRow): Promise<void> {
  if (!project.healthApiUrl) {
    return;
  }

  const result = await checkProjectHealth(project);

  await getDb().insert(projectHealthRecords).values({
    projectId: project.id,
    status: result.status,
    checkedAt: result.checkedAt,
    responseTimeMs: result.responseTimeMs,
    statusCode: result.statusCode,
    error: result.error,
  });
}

export async function pollProjectHealth(): Promise<void> {
  if (isPollingProjectHealth) {
    return;
  }

  isPollingProjectHealth = true;

  try {
    const rows = await getDb()
      .select()
      .from(projects)
      .where(and(eq(projects.isActive, true), isNotNull(projects.healthApiUrl)));

    await Promise.all(rows.map(runProjectHealth));
    await broadcastProjects();
  } finally {
    isPollingProjectHealth = false;
  }
}

export function startProjectHealthPolling(): () => void {
  const task = cron.schedule("* * * * *", () => {
    pollProjectHealth().catch((error: unknown) => {
      console.error(error);
    });
  });

  pollProjectHealth().catch((error: unknown) => {
    console.error(error);
  });

  return () => task.stop();
}

export async function listProjectTree(projectId: number): Promise<ProjectNode[] | undefined> {
  const project = await findActiveProject(projectId);

  if (!project) {
    return undefined;
  }

  return buildProjectNodeTree(await getActiveProjectNodes(projectId));
}

export async function createProjectNode(projectId: number, input: unknown): Promise<ProjectNode | undefined> {
  const project = await findActiveProject(projectId);

  if (!project) {
    return undefined;
  }

  const values = readProjectNodeInput(input);
  await assertValidParent(projectId, values.parentId);
  const siblingCount = (await getActiveProjectNodes(projectId)).filter((node) => node.parentId === values.parentId).length;
  const now = new Date();
  const [row] = await getDb()
    .insert(projectNodes)
    .values({
      ...values,
      projectId,
      sortOrder: siblingCount,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapProjectNode(row);
}

export async function updateProjectNode(
  projectId: number,
  nodeId: number,
  input: unknown,
): Promise<ProjectNode | undefined> {
  const node = await findActiveProjectNode(projectId, nodeId);

  if (!node) {
    return undefined;
  }

  const values = readObject(input);
  const updateValues: Partial<typeof projectNodes.$inferInsert> = { updatedAt: new Date() };

  if (values.title !== undefined) {
    updateValues.title = readRequiredString(values.title, "title");
  }

  if (node.type === "document" && values.content !== undefined) {
    updateValues.content = readOptionalString(values.content) ?? "";
  }

  const [row] = await getDb()
    .update(projectNodes)
    .set(updateValues)
    .where(and(eq(projectNodes.projectId, projectId), eq(projectNodes.id, nodeId), eq(projectNodes.isActive, true)))
    .returning();

  return row ? mapProjectNode(row) : undefined;
}

export async function moveProjectNode(projectId: number, nodeId: number, input: unknown): Promise<ProjectNode | undefined> {
  const node = await findActiveProjectNode(projectId, nodeId);

  if (!node) {
    return undefined;
  }

  const values = readProjectNodeMoveInput(input);
  await assertValidParent(projectId, values.parentId);
  const rows = await getActiveProjectNodes(projectId);

  if (isDescendantProjectNode(rows, nodeId, values.parentId)) {
    throw new Error("node cannot move into itself or a child");
  }

  await getDb()
    .update(projectNodes)
    .set({ parentId: values.parentId, updatedAt: new Date() })
    .where(and(eq(projectNodes.projectId, projectId), eq(projectNodes.id, nodeId), eq(projectNodes.isActive, true)));
  await normalizeProjectNodeOrder(projectId, values.parentId, nodeId, values.sortOrder);
  const moved = await findActiveProjectNode(projectId, nodeId);

  return moved ? mapProjectNode(moved) : undefined;
}

export async function deleteProjectNode(projectId: number, nodeId: number): Promise<boolean> {
  const rows = await getActiveProjectNodes(projectId);
  const target = rows.find((row) => row.id === nodeId);

  if (!target) {
    return false;
  }

  const ids = collectProjectNodeIds(rows, nodeId);

  for (const id of ids) {
    await getDb()
      .update(projectNodes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(projectNodes.projectId, projectId), eq(projectNodes.id, id)));
  }

  return true;
}

export function registerProjectRoutes(app: Hono): void {
  app.get("/api/projects", async (c) => c.json(await listProjects()));
  app.get("/api/projects/events", async () => {
    let client: ReadableStreamDefaultController<string> | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    const stream = new ReadableStream<string>({
      async start(controller) {
        client = controller;
        projectSseClients.add(controller);
        controller.enqueue("retry: 5000\n\n");
        controller.enqueue(`data: ${JSON.stringify(await listProjects())}\n\n`);
        heartbeat = setInterval(() => {
          controller.enqueue(": ping\n\n");
        }, SSE_HEARTBEAT_MS);
      },
      cancel() {
        if (client) {
          projectSseClients.delete(client);
        }

        if (heartbeat) {
          clearInterval(heartbeat);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
  app.post("/api/projects/health/test", async (c) => {
    try {
      return c.json(await checkProjectHealth(readProjectHealthTestInput(await c.req.json())));
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.post("/api/projects", async (c) => {
    try {
      return c.json(await createProject(await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/projects/:id", async (c) => {
    try {
      const project = await updateProject(readId(c.req.param("id"), "project id"), await c.req.json());
      return project ? c.json(project) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/api/projects/:id", async (c) => {
    try {
      const deleted = await deleteProject(readId(c.req.param("id"), "project id"));
      return deleted ? c.json({ ok: true }) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.get("/api/projects/:id/tree", async (c) => {
    try {
      const tree = await listProjectTree(readId(c.req.param("id"), "project id"));
      return tree ? c.json(tree) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.post("/api/projects/:id/nodes", async (c) => {
    try {
      const node = await createProjectNode(readId(c.req.param("id"), "project id"), await c.req.json());
      return node ? c.json(node, 201) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/projects/:id/nodes/:nodeId", async (c) => {
    try {
      const node = await updateProjectNode(
        readId(c.req.param("id"), "project id"),
        readId(c.req.param("nodeId"), "node id"),
        await c.req.json(),
      );
      return node ? c.json(node) : c.json({ error: "Node not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/projects/:id/nodes/:nodeId/move", async (c) => {
    try {
      const node = await moveProjectNode(
        readId(c.req.param("id"), "project id"),
        readId(c.req.param("nodeId"), "node id"),
        await c.req.json(),
      );
      return node ? c.json(node) : c.json({ error: "Node not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/api/projects/:id/nodes/:nodeId", async (c) => {
    try {
      const deleted = await deleteProjectNode(readId(c.req.param("id"), "project id"), readId(c.req.param("nodeId"), "node id"));
      return deleted ? c.json({ ok: true }) : c.json({ error: "Node not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}

async function broadcastProjects(): Promise<void> {
  const message = `data: ${JSON.stringify(await listProjects())}\n\n`;

  for (const client of projectSseClients) {
    try {
      client.enqueue(message);
    } catch {
      projectSseClients.delete(client);
    }
  }
}

async function findActiveProject(id: number): Promise<ProjectRow | undefined> {
  const [project] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.isActive, true)));

  return project;
}

async function findActiveProjectNode(projectId: number, nodeId: number): Promise<ProjectNodeRow | undefined> {
  const [node] = await getDb()
    .select()
    .from(projectNodes)
    .where(and(eq(projectNodes.projectId, projectId), eq(projectNodes.id, nodeId), eq(projectNodes.isActive, true)));

  return node;
}

async function getActiveProjectNodes(projectId: number): Promise<ProjectNodeRow[]> {
  return getDb()
    .select()
    .from(projectNodes)
    .where(and(eq(projectNodes.projectId, projectId), eq(projectNodes.isActive, true)))
    .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.title));
}

async function assertValidParent(projectId: number, parentId: number | null): Promise<void> {
  if (parentId === null) {
    return;
  }

  const parent = await findActiveProjectNode(projectId, parentId);

  if (!parent || parent.type !== "folder") {
    throw new Error("parentId must be an active folder");
  }
}

async function normalizeProjectNodeOrder(
  projectId: number,
  parentId: number | null,
  movedNodeId: number,
  sortOrder: number,
): Promise<void> {
  const siblings = (await getActiveProjectNodes(projectId))
    .filter((row) => row.parentId === parentId && row.id !== movedNodeId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const nextSiblings = [...siblings];
  nextSiblings.splice(Math.min(sortOrder, nextSiblings.length), 0, await requireProjectNode(projectId, movedNodeId));

  for (const [index, sibling] of nextSiblings.entries()) {
    await getDb()
      .update(projectNodes)
      .set({ sortOrder: index, updatedAt: new Date() })
      .where(and(eq(projectNodes.projectId, projectId), eq(projectNodes.id, sibling.id)));
  }
}

async function requireProjectNode(projectId: number, nodeId: number): Promise<ProjectNodeRow> {
  const node = await findActiveProjectNode(projectId, nodeId);

  if (!node) {
    throw new Error("node not found");
  }

  return node;
}

function collectProjectNodeIds(rows: ProjectNodeRow[], rootId: number): number[] {
  const ids = [rootId];
  let index = 0;

  while (index < ids.length) {
    const currentId = ids[index];
    ids.push(...rows.filter((row) => row.parentId === currentId).map((row) => row.id));
    index += 1;
  }

  return ids;
}

function sortProjectNodes(nodes: ProjectNode[]): void {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  for (const node of nodes) {
    sortProjectNodes(node.children);
  }
}

async function mapProject(row: ProjectRow): Promise<Project> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logoUrl: row.logoFileId ? (await findActiveFile(row.logoFileId))?.publicUrl ?? row.logoUrl : row.logoUrl,
    logoFileId: row.logoFileId,
    logoVariant: readLogoVariant(row.logoVariant),
    healthApiUrl: row.healthApiUrl,
    health: await mapProjectHealth(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function mapProjectHealth(row: ProjectRow): Promise<ProjectHealth | null> {
  if (!row.healthApiUrl) {
    return null;
  }

  // ponytail: one query per project is fine for this local dashboard; batch if project count grows.
  const records = await getDb()
    .select()
    .from(projectHealthRecords)
    .where(eq(projectHealthRecords.projectId, row.id))
    .orderBy(desc(projectHealthRecords.checkedAt))
    .limit(HISTORY_LIMIT);
  const history = records.reverse().map(mapProjectHealthRecord);
  const latest = history.at(-1);

  return {
    status: latest?.status ?? "unhealthy",
    checkedAt: latest?.checkedAt ?? row.createdAt.toISOString(),
    responseTimeMs: latest?.responseTimeMs ?? null,
    history,
  };
}

function mapProjectHealthRecord(row: ProjectHealthRecordRow): ProjectHealthRecord {
  return {
    checkedAt: row.checkedAt.toISOString(),
    status: readProjectHealthStatus(row.status),
    responseTimeMs: row.responseTimeMs,
  };
}

function mapProjectNode(row: ProjectNodeRow): ProjectNode {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    type: readProjectNodeType(row.type),
    title: row.title,
    content: row.content,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    children: [],
  };
}

function readObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    throw new Error("body is required");
  }

  return input as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("value must be a string");
  }

  return value.trim() || null;
}

function readOptionalHttpUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readHttpUrl(value, field);
}

function readHttpUrl(value: unknown, field: string): string {
  const url = readRequiredString(value, field);

  try {
    const parsed = new URL(url);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // handled below
  }

  throw new Error(`${field} must be an http(s) URL`);
}

function readOptionalLogoUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const url = readRequiredString(value, field);

  if (url.startsWith("data:image/") || url.startsWith("/uploads/") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  throw new Error(`${field} must be an image URL`);
}

function readLogoVariant(value: unknown): LogoVariant {
  if (value === null || value === undefined || value === "") {
    return "black";
  }

  if (value === "black" || value === "white") {
    return value;
  }

  throw new Error("logoVariant must be black or white");
}

function readProjectHealthStatus(value: string): ProjectHealthStatus {
  if (value === "healthy" || value === "unhealthy") {
    return value;
  }

  return "unhealthy";
}

function readProjectNodeType(value: unknown): ProjectNodeType {
  if (value === "folder" || value === "document") {
    return value;
  }

  throw new Error("type must be folder or document");
}

function readOptionalPositiveInteger(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return number;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return number;
}

function readId(value: string, field: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return id;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid request";
}
