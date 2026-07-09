import assert from "node:assert/strict";
import { test } from "node:test";

import { readNoteInput, readNoteKind, readNotePatchInput } from "./notes.helper.js";

test("readNoteKind accepts supported note kinds", () => {
  assert.equal(readNoteKind("inbox"), "inbox");
  assert.equal(readNoteKind("daily"), "daily");
  assert.throws(() => readNoteKind("todo"), /kind must be inbox or daily/);
});

test("readNoteInput validates inbox notes", () => {
  assert.deepEqual(readNoteInput({ kind: "inbox", content: "  memo  ", color: "#f4b400" }), {
    kind: "inbox",
    title: null,
    content: "memo",
    color: "#f4b400",
    noteDate: null,
  });
  assert.throws(() => readNoteInput({ kind: "inbox", content: "" }), /content is required/);
});

test("readNoteInput validates daily note dates", () => {
  assert.deepEqual(readNoteInput({ kind: "daily", title: "오늘", content: "body", noteDate: "2026-07-07" }), {
    kind: "daily",
    title: "오늘",
    content: "body",
    color: "#f4b400",
    noteDate: "2026-07-07",
  });
  assert.throws(() => readNoteInput({ kind: "daily", content: "body" }), /noteDate is required for daily notes/);
});

test("readNotePatchInput keeps partial updates partial", () => {
  assert.deepEqual(readNotePatchInput({ content: " changed " }), { content: "changed" });
  assert.deepEqual(readNotePatchInput({ isArchived: true }), { isArchived: true });
  assert.throws(() => readNotePatchInput({ noteDate: "2026-02-30" }), /noteDate must be YYYY-MM-DD/);
});
