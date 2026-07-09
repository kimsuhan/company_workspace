import type { Note, NoteInput, NoteKind, NotePatchInput, NoteRow } from "./notes.type.js";

const DEFAULT_NOTE_COLOR = "#f4b400";

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

export function mapNote(row: NoteRow): Note {
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
