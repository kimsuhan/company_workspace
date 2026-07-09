import type { SlackMappedField } from "../slack-lists/slack-lists.service.js";
import type { WorkspaceUser, WorkspaceUserInput, WorkspaceUserRow } from "./workspace-users.type.js";

export function readWorkspaceUserInput(input: unknown, current?: WorkspaceUserRow): WorkspaceUserInput {
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

export function mapWorkspaceUserRow(row: WorkspaceUserRow): WorkspaceUser {
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

export function normalizeMappedFields(value: unknown): Record<string, SlackMappedField> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, SlackMappedField>) : {};
}

export function formatTaskValue(value: unknown): string | null {
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

export function readRouteId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
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
