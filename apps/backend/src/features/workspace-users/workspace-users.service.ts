import { and, asc, desc, eq, ne } from "drizzle-orm";

import { getDb } from "../../common/db.js";
import {
  getAssignedSlackUserIds,
  getMappedTitle,
  getSlackFieldRoles,
  isSlackListItemDone,
  isSlackListItemInProgress,
  readMappingConfig,
} from "../slack-lists/slack-lists.service.js";
import { slackListItems, slackListSources, workspaceUsers } from "../../common/schema.js";
import { formatTaskValue, mapWorkspaceUserRow, normalizeMappedFields, readWorkspaceUserInput } from "./workspace-users.helper.js";
import type { WorkspaceUser, WorkspaceUserRow, WorkspaceUserStatus } from "./workspace-users.type.js";

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
