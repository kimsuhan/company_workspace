import type { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "./db.js";
import { projects, todoComments, todoMemos } from "./schema.js";

const SSE_HEARTBEAT_MS = 25_000;
const DEFAULT_TODO_COLOR = "#1c69d4";

type TodoRow = typeof todoMemos.$inferSelect;
type TodoCommentRow = typeof todoComments.$inferSelect;

export type TodoComment = {
  id: number;
  todoMemoId: number;
  body: string;
  createdAt: string;
};

export type TodoMemo = {
  id: number;
  projectId: number;
  title: string;
  content: string;
  color: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  comments: TodoComment[];
};

type TodoUpdateInput = {
  projectId?: unknown;
  title?: unknown;
  content?: unknown;
  color?: unknown;
  dueDate?: unknown;
  isCompleted?: unknown;
};

const sseClients = new Set<ReadableStreamDefaultController<string>>();

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

export async function listTodoMemos(): Promise<TodoMemo[]> {
  const db = getDb();
  const memoRows = await db.select().from(todoMemos).orderBy(asc(todoMemos.dueDate));
  const commentRows = await db.select().from(todoComments).orderBy(asc(todoComments.createdAt));

  return sortTodoMemos(memoRows.map((memo) => mapTodoMemo(memo, commentRows)));
}

export async function createTodoMemo(input: { projectId: unknown; title: unknown; content: unknown; color?: unknown; dueDate: unknown }): Promise<TodoMemo> {
  const projectId = await readActiveProjectId(input.projectId);
  const title = readRequiredString(input.title, "title");
  const content = readRequiredString(input.content, "content");
  const color = readTodoColor(input.color);
  const dueDate = readOptionalDateString(input.dueDate, "dueDate");
  const now = new Date();
  const [row] = await getDb()
    .insert(todoMemos)
    .values({
      projectId,
      title,
      content,
      color,
      dueDate,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = mapTodoMemo(row, []);
  broadcastTodoMemos().catch((error: unknown) => {
    console.error(error);
  });

  return created;
}

export async function updateTodoMemo(id: number, input: TodoUpdateInput): Promise<TodoMemo | undefined> {
  const values: Partial<typeof todoMemos.$inferInsert> = { updatedAt: new Date() };

  if (input.projectId !== undefined) {
    values.projectId = await readActiveProjectId(input.projectId);
  }

  if (input.title !== undefined) {
    values.title = readRequiredString(input.title, "title");
  }

  if (input.content !== undefined) {
    values.content = readRequiredString(input.content, "content");
  }

  if (input.color !== undefined) {
    values.color = readTodoColor(input.color);
  }

  if (input.dueDate !== undefined) {
    values.dueDate = readOptionalDateString(input.dueDate, "dueDate");
  }

  if (typeof input.isCompleted === "boolean") {
    values.completedAt = input.isCompleted ? new Date() : null;
  }

  const [row] = await getDb().update(todoMemos).set(values).where(eq(todoMemos.id, id)).returning();

  if (!row) {
    return undefined;
  }

  await broadcastTodoMemos();
  return mapTodoMemo(row, await getComments());
}

export async function createTodoComment(id: number, input: { body: unknown }): Promise<TodoComment> {
  const body = readRequiredString(input.body, "body");
  const [row] = await getDb()
    .insert(todoComments)
    .values({ todoMemoId: id, body })
    .returning();

  await broadcastTodoMemos();
  return mapTodoComment(row);
}

export async function deleteTodoComment(todoId: number, commentId: number): Promise<void> {
  await getDb()
    .delete(todoComments)
    .where(and(eq(todoComments.todoMemoId, todoId), eq(todoComments.id, commentId)));
  await broadcastTodoMemos();
}

export async function deleteTodoMemo(id: number): Promise<void> {
  await getDb().delete(todoMemos).where(eq(todoMemos.id, id));
  await broadcastTodoMemos();
}

export function registerTodoRoutes(app: Hono): void {
  app.get("/todos", async (c) => c.json(await listTodoMemos()));
  app.get("/todos/events", async () => {
    let client: ReadableStreamDefaultController<string> | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    const stream = new ReadableStream<string>({
      async start(controller) {
        client = controller;
        sseClients.add(controller);
        controller.enqueue("retry: 5000\n\n");
        controller.enqueue(`data: ${JSON.stringify(await listTodoMemos())}\n\n`);
        heartbeat = setInterval(() => {
          controller.enqueue(": ping\n\n");
        }, SSE_HEARTBEAT_MS);
      },
      cancel() {
        if (client) {
          sseClients.delete(client);
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
  app.post("/todos", async (c) => {
    try {
      return c.json(await createTodoMemo(await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/todos/:id", async (c) => {
    try {
      const memo = await updateTodoMemo(readId(c.req.param("id")), await c.req.json());
      return memo ? c.json(memo) : c.json({ error: "Todo not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/todos/:id", async (c) => {
    try {
      await deleteTodoMemo(readId(c.req.param("id")));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.post("/todos/:id/comments", async (c) => {
    try {
      return c.json(await createTodoComment(readId(c.req.param("id")), await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/todos/:id/comments/:commentId", async (c) => {
    try {
      await deleteTodoComment(readId(c.req.param("id")), readId(c.req.param("commentId")));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}

async function broadcastTodoMemos(): Promise<void> {
  const message = `data: ${JSON.stringify(await listTodoMemos())}\n\n`;

  for (const client of sseClients) {
    try {
      client.enqueue(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function getComments(): Promise<TodoCommentRow[]> {
  return getDb().select().from(todoComments).orderBy(asc(todoComments.createdAt));
}

function mapTodoMemo(row: TodoRow, comments: TodoCommentRow[]): TodoMemo {
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

function mapTodoComment(row: TodoCommentRow): TodoComment {
  return {
    id: row.id,
    todoMemoId: row.todoMemoId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

async function readActiveProjectId(value: unknown): Promise<number> {
  const projectId = readTodoProjectId(value);
  const [project] = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.isActive, true)));

  if (!project) {
    throw new Error("projectId must be an active project");
  }

  return projectId;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
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

function readOptionalDateString(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readDateString(value, field);
}

function readId(value: string): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new Error("Invalid id");
  }

  return id;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid request";
}
