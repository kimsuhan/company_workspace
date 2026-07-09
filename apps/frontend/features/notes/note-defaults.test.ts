import assert from "node:assert/strict";
import { test } from "node:test";

import { newInboxNoteContent } from "./note-defaults.js";

test("newInboxNoteContent starts as an empty Tiptap paragraph", () => {
  assert.equal(newInboxNoteContent, "<p></p>");
});
