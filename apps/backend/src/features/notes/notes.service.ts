import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../../common/db.js";
import { notes } from "../../common/schema.js";
import { mapNote, readNoteKind } from "./notes.helper.js";
import type { Note, NoteInput, NoteKind, NotePatchInput } from "./notes.type.js";

const SSE_HEARTBEAT_MS = 25_000;

const noteSseClients = new Set<ReadableStreamDefaultController<string>>();

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

export async function createNote(values: NoteInput): Promise<Note> {
  const now = new Date();
  const [row] = await getDb()
    .insert(notes)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning();

  await broadcastNotes();
  return mapNote(row);
}

export async function updateNote(id: number, values: NotePatchInput): Promise<Note | undefined> {
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

export function createNoteEventStream(): ReadableStream<string> {
  let client: ReadableStreamDefaultController<string> | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  return new ReadableStream<string>({
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
