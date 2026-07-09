import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "../../common/db.js";
import { findActiveFile } from "../files/files.service.js";
import { projectHealthRecords, projectNodes, projects } from "../../common/schema.js";
import {
  buildProjectNodeTree,
  collectProjectNodeIds,
  getErrorMessage,
  isDescendantProjectNode,
  mapProjectHealthRecord,
  mapProjectNode,
  readLogoVariant,
  readObject,
  readOptionalString,
  readProjectInput,
  readProjectNodeInput,
  readProjectNodeMoveInput,
  readRequiredString,
} from "./projects.helper.js";
import type { Project, ProjectHealth, ProjectHealthFetch, ProjectHealthResult, ProjectNode, ProjectNodeRow, ProjectRow } from "./projects.type.js";

const CHECK_TIMEOUT_MS = 10_000;
const HISTORY_LIMIT = 60;
const SSE_HEARTBEAT_MS = 25_000;

const projectSseClients = new Set<ReadableStreamDefaultController<string>>();
let isPollingProjectHealth = false;

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

export function createProjectEventStream(): ReadableStream<string> {
  let client: ReadableStreamDefaultController<string> | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  return new ReadableStream<string>({
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
