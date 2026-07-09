import type { TodoComment, TodoCommentRow, TodoMemo, TodoRow } from "./todos.type.js";

const DEFAULT_TODO_COLOR = "#1c69d4";

export function sortTodoMemos(memos: TodoMemo[]): TodoMemo[] {
  return [...memos].sort((a, b) => {
    const aDueDate = a.dueDate ?? "9999-12-31";
    const bDueDate = b.dueDate ?? "9999-12-31";

    if (!a.completedAt && b.completedAt) {
      return -1;
    }

    if (a.completedAt && !b.completedAt) {
      return 1;
    }

    if (a.completedAt && b.completedAt) {
      return b.completedAt.localeCompare(a.completedAt);
    }

    return aDueDate.localeCompare(bDueDate) || a.createdAt.localeCompare(b.createdAt);
  });
}

export function toggleCompletedAt(completedAt: string | null, now = new Date()): string | null {
  return completedAt ? null : now.toISOString();
}

export function deleteTodoCommentFromMemo(memo: TodoMemo, commentId: number): TodoMemo {
  return {
    ...memo,
    comments: memo.comments.filter((comment) => comment.id !== commentId),
  };
}

export function readTodoColor(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_TODO_COLOR;
  }

  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error("color must be #RRGGBB");
  }

  return value.toLowerCase();
}

export function readTodoProjectId(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    throw new Error("projectId is required");
  }

  const projectId = Number(value);

  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("projectId must be a positive integer");
  }

  return projectId;
}

export function readTodoCommentBody(value: unknown): string {
  return readRequiredString(value, "body");
}

export function mapTodoMemo(row: TodoRow, comments: TodoCommentRow[]): TodoMemo {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    content: row.content,
    color: row.color,
    dueDate: row.dueDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    comments: comments.filter((comment) => comment.todoMemoId === row.id).map(mapTodoComment),
  };
}

export function mapTodoComment(row: TodoCommentRow): TodoComment {
  return {
    id: row.id,
    todoMemoId: row.todoMemoId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

export function readOptionalDateString(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readDateString(value, field);
}

export function readId(value: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new Error("Invalid id");
  }

  return id;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid request";
}

function readDateString(value: unknown, field: string): string {
  const date = readRequiredString(value, field);
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }

  return date;
}
