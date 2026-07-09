import { and, asc, eq } from "drizzle-orm";

import { getDb } from "../../common/db.js";
import { projects, todoComments, todoMemos } from "../../common/schema.js";
import {
  mapTodoComment,
  mapTodoMemo,
  readOptionalDateString,
  readRequiredString,
  readTodoColor,
  readTodoCommentBody,
  readTodoProjectId,
  sortTodoMemos,
} from "./todos.helper.js";
import type { TodoComment, TodoCommentRow, TodoCreateInput, TodoMemo, TodoUpdateInput } from "./todos.type.js";

const SSE_HEARTBEAT_MS = 25_000;

const sseClients = new Set<ReadableStreamDefaultController<string>>();

export async function listTodoMemos(): Promise<TodoMemo[]> {
  const db = getDb();
  const memoRows = await db.select().from(todoMemos).orderBy(asc(todoMemos.dueDate));
  const commentRows = await db.select().from(todoComments).orderBy(asc(todoComments.createdAt));

  return sortTodoMemos(memoRows.map((memo) => mapTodoMemo(memo, commentRows)));
}

export async function createTodoMemo(input: TodoCreateInput): Promise<TodoMemo> {
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
  const body = readTodoCommentBody(input.body);
  const [row] = await getDb()
    .insert(todoComments)
    .values({ todoMemoId: id, body })
    .returning();

  await broadcastTodoMemos();
  return mapTodoComment(row);
}

export async function updateTodoComment(todoId: number, commentId: number, input: { body: unknown }): Promise<TodoComment | undefined> {
  const body = readTodoCommentBody(input.body);
  const [row] = await getDb()
    .update(todoComments)
    .set({ body })
    .where(and(eq(todoComments.todoMemoId, todoId), eq(todoComments.id, commentId)))
    .returning();

  if (!row) {
    return undefined;
  }

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

export function createTodoEventStream(): ReadableStream<string> {
  let client: ReadableStreamDefaultController<string> | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  return new ReadableStream<string>({
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
