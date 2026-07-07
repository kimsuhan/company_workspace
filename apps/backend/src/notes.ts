import type { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "./db.js";
import { notes } from "./schema.js";

const DEFAULT_NOTE_COLOR = "#f4b400";
const SSE_HEARTBEAT_MS = 25_000;

type NoteRow = typeof notes.$inferSelect;
export type NoteKind = "inbox" | "daily";

export type Note = {
  id: number;
  kind: NoteKind;
  title: string | null;
  content: string;
  color: string;
  noteDate: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type NoteInput = {
  kind: NoteKind;
  title: string | null;
  content: string;
  color: string;
  noteDate: string | null;
};

type NotePatchInput = Partial<NoteInput> & {
  isArchived?: boolean;
};

const noteSseClients = new Set<ReadableStreamDefaultController<string>>();

export function readNoteKind(value: unknown): NoteKind {
  if (value === "inbox" || value === "daily") {
    return value;
  }

  throw new Error("kind must be inbox or daily");
}

export function readNoteInput(input: unknown): NoteInput {
  const values = readObject(input);
  const kind = readNoteKind(values.kind);
  const noteDate = kind === "daily" ? readRequiredDateString(values.noteDate, "noteDate") : readOptionalDateString(values.noteDate, "noteDate");

  if (kind === "inbox" && noteDate) {
    throw new Error("noteDate is only allowed for daily notes");
  }

  return {
    kind,
    title: readOptionalString(values.title),
    content: readRequiredString(values.content, "content"),
    color: readNoteColor(values.color),
    noteDate,
  };
}

export function readNotePatchInput(input: unknown): NotePatchInput {
  const values = readObject(input);
  const patch: NotePatchInput = {};

  if (values.kind !== undefined) {
    patch.kind = readNoteKind(values.kind);
  }

  if (values.title !== undefined) {
    patch.title = readOptionalString(values.title);
  }

  if (values.content !== undefined) {
    patch.content = readRequiredString(values.content, "content");
  }

  if (values.color !== undefined) {
    patch.color = readNoteColor(values.color);
  }

  if (values.noteDate !== undefined) {
    patch.noteDate = readOptionalDateString(values.noteDate, "noteDate");
  }

  if (values.isArchived !== undefined) {
    if (typeof values.isArchived !== "boolean") {
      throw new Error("isArchived must be a boolean");
    }

    patch.isArchived = values.isArchived;
  }

  return patch;
}

export async function listNotes(kind?: NoteKind): Promise<Note[]> {
  const rows = kind
    ? await getDb()
        .select()
        .from(notes)
        .where(and(eq(notes.kind, kind), eq(notes.isArchived, false)))
        .orderBy(desc(notes.updatedAt))
    : await getDb().select().from(notes).where(eq(notes.isArchived, false)).orderBy(desc(notes.updatedAt));

  return rows.map(mapNote);
}

export async function createNote(input: unknown): Promise<Note> {
  const values = readNoteInput(input);
  const now = new Date();
  const [row] = await getDb()
    .insert(notes)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning();

  await broadcastNotes();
  return mapNote(row);
}

export async function updateNote(id: number, input: unknown): Promise<Note | undefined> {
  const values = readNotePatchInput(input);
  const [existing] = await getDb().select().from(notes).where(eq(notes.id, id));

  if (!existing) {
    return undefined;
  }

  const kind = values.kind ?? readNoteKind(existing.kind);
  const noteDate = values.noteDate !== undefined ? values.noteDate : existing.noteDate;

  if (kind === "daily" && !noteDate) {
    throw new Error("noteDate is required for daily notes");
  }

  if (kind === "inbox" && noteDate) {
    throw new Error("noteDate is only allowed for daily notes");
  }

  const [row] = await getDb()
    .update(notes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();

  await broadcastNotes();
  return row ? mapNote(row) : undefined;
}

export async function deleteNote(id: number): Promise<void> {
  await getDb().delete(notes).where(eq(notes.id, id));
  await broadcastNotes();
}

export function registerNoteRoutes(app: Hono): void {
  app.get("/api/notes", async (c) => {
    try {
      const kindParam = c.req.query("kind");
      return c.json(await listNotes(kindParam ? readNoteKind(kindParam) : undefined));
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.get("/api/notes/events", async () => {
    let client: ReadableStreamDefaultController<string> | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    const stream = new ReadableStream<string>({
      async start(controller) {
        client = controller;
        noteSseClients.add(controller);
        controller.enqueue("retry: 5000\n\n");
        controller.enqueue(`data: ${JSON.stringify(await listNotes())}\n\n`);
        heartbeat = setInterval(() => {
          controller.enqueue(": ping\n\n");
        }, SSE_HEARTBEAT_MS);
      },
      cancel() {
        if (client) {
          noteSseClients.delete(client);
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
  app.post("/api/notes", async (c) => {
    try {
      return c.json(await createNote(await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/notes/:id", async (c) => {
    try {
      const note = await updateNote(readId(c.req.param("id")), await c.req.json());
      return note ? c.json(note) : c.json({ error: "Note not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/api/notes/:id", async (c) => {
    try {
      await deleteNote(readId(c.req.param("id")));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}

async function broadcastNotes(): Promise<void> {
  const message = `data: ${JSON.stringify(await listNotes())}\n\n`;

  for (const client of noteSseClients) {
    try {
      client.enqueue(message);
    } catch {
      noteSseClients.delete(client);
    }
  }
}

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    kind: readNoteKind(row.kind),
    title: row.title,
    content: row.content,
    color: row.color,
    noteDate: row.noteDate,
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

function readNoteColor(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_NOTE_COLOR;
  }

  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error("color must be #RRGGBB");
  }

  return value.toLowerCase();
}

function readRequiredDateString(value: unknown, field: string): string {
  if (value === null || value === undefined || value === "") {
    throw new Error(`${field} is required for daily notes`);
  }

  return readDateString(value, field);
}

function readOptionalDateString(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readDateString(value, field);
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
