import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldSubmitTodoComment } from "./todo-comment-shortcuts.js";

test("shouldSubmitTodoComment accepts command or control enter", () => {
  assert.equal(shouldSubmitTodoComment({ key: "Enter", metaKey: true, ctrlKey: false }), true);
  assert.equal(shouldSubmitTodoComment({ key: "Enter", metaKey: false, ctrlKey: true }), true);
});

test("shouldSubmitTodoComment ignores plain enter and other shortcut keys", () => {
  assert.equal(shouldSubmitTodoComment({ key: "Enter", metaKey: false, ctrlKey: false }), false);
  assert.equal(shouldSubmitTodoComment({ key: "a", metaKey: true, ctrlKey: false }), false);
});
