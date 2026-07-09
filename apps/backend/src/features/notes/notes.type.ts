import { notes } from "../../common/schema.js";

export type NoteRow = typeof notes.$inferSelect;

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

export type NoteInput = {
  kind: NoteKind;
  title: string | null;
  content: string;
  color: string;
  noteDate: string | null;
};

export type NotePatchInput = Partial<NoteInput> & {
  isArchived?: boolean;
};
