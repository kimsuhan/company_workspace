import type { Hono } from "hono";
import { and, asc, desc, eq, ne } from "drizzle-orm";

import { getDb } from "./db.js";
import {
  getAssignedSlackUserIds,
  getMappedTitle,
  getSlackFieldRoles,
  isSlackListItemDone,
  isSlackListItemInProgress,
  readMappingConfig,
  type SlackMappedField,
} from "./slack-lists.js";
import { slackListItems, slackListSources, workspaceUsers } from "./schema.js";

type WorkspaceUserRow = typeof workspaceUsers.$inferSelect;
type SlackListSourceRow = typeof slackListSources.$inferSelect;

export type WorkspaceUser = {
  id: number;
  name: string;
  slackUserId: string | null;
  profileImageFileId: number | null;
  profileImageUrl: string | null;
  isMe: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceUserCurrentTask = {
  id: number;
  sourceId: number;
  sourceName: string;
  slackItemId: string;
  title: string;
  status: string | null;
  lastSeenAt: string;
};

export type WorkspaceUserStatus = {
  user: WorkspaceUser;
  status: "working" | "idle";
  currentTasks: WorkspaceUserCurrentTask[];
};

export function readWorkspaceUserInput(input: unknown, current?: WorkspaceUserRow): {
  name: string;
  slackUserId: string | null;
  profileImageFileId: number | null;
  isMe: boolean;
} {
  const values = readObject(input);
  const name = values.name === undefined ? current?.name : readRequiredString(values.name, "name");
  const slackUserId = values.slackUserId === undefined ? current?.slackUserId ?? null : readSlackUserId(values.slackUserId);
  const profileImageFileId =
    values.profileImageFileId === undefined
      ? current?.profileImageFileId ?? null
      : readOptionalPositiveInteger(values.profileImageFileId, "profileImageFileId");
  const isMe = values.isMe === undefined ? current?.isMe ?? false : readBoolean(values.isMe, "isMe");

  if (!name) {
    throw new Error("name is required");
  }

  return {
    name,
    slackUserId,
    profileImageFileId,
    isMe,
  };
}

export function getWorkspaceUserSaveErrorMessage(error: unknown): string {
  const details = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const constraint = details.constraint_name ?? details.constraint;

  if (details.code === "23505" && constraint === "workspace_users_slack_user_id_unique") {
    return "Slack User ID is already mapped";
  }

  return error instanceof Error ? error.message : "Workspace user request failed";
}

export async function listWorkspaceUsers(): Promise<WorkspaceUser[]> {
  const rows = await getDb()
    .select()
    .from(workspaceUsers)
    .where(eq(workspaceUsers.isActive, true))
    .orderBy(asc(workspaceUsers.name), asc(workspaceUsers.id));

  return rows.map(mapWorkspaceUserRow);
}

export async function createWorkspaceUser(input: unknown): Promise<WorkspaceUser> {
  const now = new Date();
  const values = readWorkspaceUserInput(input);
  const [row] = await getDb()
    .insert(workspaceUsers)
    .values({ ...values, isMe: false, isActive: true, createdAt: now, updatedAt: now })
    .returning();

  return values.isMe ? await setWorkspaceUserAsMe(row.id) : mapWorkspaceUserRow(row);
}

export async function updateWorkspaceUser(id: number, input: unknown): Promise<WorkspaceUser | undefined> {
  const current = await getActiveWorkspaceUser(id);

  if (!current) {
    return undefined;
  }

  const values = readWorkspaceUserInput(input, current);
  const [row] = await getDb()
    .update(workspaceUsers)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(workspaceUsers.id, id), eq(workspaceUsers.isActive, true)))
    .returning();

  if (!row) {
    return undefined;
  }

  return values.isMe ? await setWorkspaceUserAsMe(id) : mapWorkspaceUserRow(row);
}

export async function deleteWorkspaceUser(id: number): Promise<boolean> {
  const [row] = await getDb()
    .update(workspaceUsers)
    .set({ isActive: false, slackUserId: null, profileImageFileId: null, updatedAt: new Date() })
    .where(and(eq(workspaceUsers.id, id), eq(workspaceUsers.isActive, true)))
    .returning();

  return Boolean(row);
}

export async function listWorkspaceUserStatuses(): Promise<WorkspaceUserStatus[]> {
  const [users, sources, items] = await Promise.all([
    getDb()
      .select()
      .from(workspaceUsers)
      .where(eq(workspaceUsers.isActive, true))
      .orderBy(asc(workspaceUsers.name), asc(workspaceUsers.id)),
    getDb().select().from(slackListSources).where(eq(slackListSources.isActive, true)),
    getDb()
      .select()
      .from(slackListItems)
      .where(eq(slackListItems.isActive, true))
      .orderBy(desc(slackListItems.lastSeenAt)),
  ]);
  const statusByUserId = new Map<number, WorkspaceUserStatus>();
  const userBySlackId = new Map(users.flatMap((user) => (user.slackUserId ? [[user.slackUserId, user]] : [])));
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  for (const user of users) {
    statusByUserId.set(user.id, {
      user: mapWorkspaceUserRow(user),
      status: "idle",
      currentTasks: [],
    });
  }

  for (const item of items) {
    const source = sourceById.get(item.sourceId);

    if (!source) {
      continue;
    }

    const fields = normalizeMappedFields(item.mappedFields);
    const mapping = readMappingConfig(source.fieldMapping);

    if (isSlackListItemDone(fields, mapping) || !isSlackListItemInProgress(fields, mapping)) {
      continue;
    }

    const assigneeIds = getAssignedSlackUserIds(fields, mapping);

    if (assigneeIds.length === 0) {
      continue;
    }

    const roles = getSlackFieldRoles(fields, mapping);
    const status = roles.status ? formatTaskValue(fields[roles.status]?.value) : null;
    const task = {
      id: item.id,
      sourceId: source.id,
      sourceName: source.name,
      slackItemId: item.slackItemId,
      title: getMappedTitle(fields, mapping),
      status,
      lastSeenAt: item.lastSeenAt.toISOString(),
    };

    for (const slackUserId of assigneeIds) {
      const user = userBySlackId.get(slackUserId);

      if (!user) {
        continue;
      }

      const userStatus = statusByUserId.get(user.id);

      if (!userStatus) {
        continue;
      }

      userStatus.status = "working";
      userStatus.currentTasks.push(task);
    }
  }

  return Array.from(statusByUserId.values());
}

export function registerWorkspaceUserRoutes(app: Hono): void {
  app.get("/api/workspace-users", async (c) => c.json(await listWorkspaceUsers()));
  app.get("/api/workspace-users/status", async (c) => c.json(await listWorkspaceUserStatuses()));

  app.post("/api/workspace-users", async (c) => {
    try {
      return c.json(await createWorkspaceUser(await c.req.json().catch(() => ({}))), 201);
    } catch (error) {
      return c.json({ error: getWorkspaceUserSaveErrorMessage(error) }, 400);
    }
  });

  app.patch("/api/workspace-users/:id", async (c) => {
    const id = readRouteId(c.req.param("id"));

    if (id === null) {
      return c.json({ error: "Invalid workspace user id" }, 400);
    }

    try {
      const user = await updateWorkspaceUser(id, await c.req.json().catch(() => ({})));
      return user ? c.json(user) : c.json({ error: "Workspace user not found" }, 404);
    } catch (error) {
      return c.json({ error: getWorkspaceUserSaveErrorMessage(error) }, 400);
    }
  });

  app.delete("/api/workspace-users/:id", async (c) => {
    const id = readRouteId(c.req.param("id"));

    if (id === null) {
      return c.json({ error: "Invalid workspace user id" }, 400);
    }

    return (await deleteWorkspaceUser(id)) ? c.json({ ok: true }) : c.json({ error: "Workspace user not found" }, 404);
  });
}

function mapWorkspaceUserRow(row: WorkspaceUserRow): WorkspaceUser {
  return {
    id: row.id,
    name: row.name,
    slackUserId: row.slackUserId,
    profileImageFileId: row.profileImageFileId,
    profileImageUrl: row.profileImageFileId ? `/api/files/${row.profileImageFileId}` : null,
    isMe: row.isMe,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function setWorkspaceUserAsMe(id: number): Promise<WorkspaceUser> {
  const now = new Date();

  await getDb()
    .update(workspaceUsers)
    .set({ isMe: false, updatedAt: now })
    .where(and(eq(workspaceUsers.isActive, true), eq(workspaceUsers.isMe, true), ne(workspaceUsers.id, id)));

  const [row] = await getDb()
    .update(workspaceUsers)
    .set({ isMe: true, updatedAt: now })
    .where(and(eq(workspaceUsers.id, id), eq(workspaceUsers.isActive, true)))
    .returning();

  return mapWorkspaceUserRow(row);
}

async function getActiveWorkspaceUser(id: number): Promise<WorkspaceUserRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(workspaceUsers)
    .where(and(eq(workspaceUsers.id, id), eq(workspaceUsers.isActive, true)));
  return row;
}

function normalizeMappedFields(value: unknown): Record<string, SlackMappedField> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, SlackMappedField>) : {};
}

function formatTaskValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const joined = value.map((item) => formatTaskValue(item)).filter(Boolean).join(", ");
    return joined || null;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const text = String(value).trim();
  return text || null;
}

function readObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function readSlackUserId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("slackUserId must be a Slack user ID");
  }

  const slackUserId = value.trim().toUpperCase();

  if (!slackUserId) {
    return null;
  }

  if (!/^U[A-Z0-9]+$/.test(slackUserId)) {
    throw new Error("slackUserId must be a Slack user ID");
  }

  return slackUserId;
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

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }

  return value;
}

function readRouteId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
