import type {
  LogoVariant,
  ProjectHealthRecord,
  ProjectHealthRecordRow,
  ProjectHealthStatus,
  ProjectInput,
  ProjectNode,
  ProjectNodeInput,
  ProjectNodeMoveInput,
  ProjectNodeRow,
  ProjectNodeType,
} from "./projects.type.js";

export function readProjectInput(input: unknown): ProjectInput {
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

export function readProjectNodeInput(input: unknown): ProjectNodeInput {
  const values = readObject(input);
  const type = readProjectNodeType(values.type);

  return {
    type,
    title: readRequiredString(values.title, "title"),
    parentId: readOptionalPositiveInteger(values.parentId, "parentId"),
    content: type === "document" ? readOptionalString(values.content) ?? "" : "",
  };
}

export function readProjectNodeMoveInput(input: unknown): ProjectNodeMoveInput {
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

export function collectProjectNodeIds(rows: ProjectNodeRow[], rootId: number): number[] {
  const ids = [rootId];
  let index = 0;

  while (index < ids.length) {
    const currentId = ids[index];
    ids.push(...rows.filter((row) => row.parentId === currentId).map((row) => row.id));
    index += 1;
  }

  return ids;
}

export function mapProjectHealthRecord(row: ProjectHealthRecordRow): ProjectHealthRecord {
  return {
    checkedAt: row.checkedAt.toISOString(),
    status: readProjectHealthStatus(row.status),
    responseTimeMs: row.responseTimeMs,
  };
}

export function mapProjectNode(row: ProjectNodeRow): ProjectNode {
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

export function readObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    throw new Error("body is required");
  }

  return input as Record<string, unknown>;
}

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

export function readOptionalString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("value must be a string");
  }

  return value.trim() || null;
}

export function readLogoVariant(value: unknown): LogoVariant {
  if (value === null || value === undefined || value === "") {
    return "black";
  }

  if (value === "black" || value === "white") {
    return value;
  }

  throw new Error("logoVariant must be black or white");
}

export function readProjectHealthStatus(value: string): ProjectHealthStatus {
  if (value === "healthy" || value === "unhealthy") {
    return value;
  }

  return "unhealthy";
}

export function readId(value: string, field: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return id;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid request";
}

function sortProjectNodes(nodes: ProjectNode[]): void {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  for (const node of nodes) {
    sortProjectNodes(node.children);
  }
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
