import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteTodoCommentFromMemo,
  readTodoCommentBody,
  readTodoProjectId,
  readTodoColor,
  sortTodoMemos,
  toggleCompletedAt,
  type TodoMemo,
} from "./todos.js";

test("readTodoColor accepts hex colors and defaults empty values", () => {
  assert.equal(readTodoColor("#e22718"), "#e22718");
  assert.equal(readTodoColor(undefined), "#1c69d4");
  assert.throws(() => readTodoColor("red"), /color must be #RRGGBB/);
});

test("readTodoProjectId requires a positive project id", () => {
  assert.equal(readTodoProjectId(3), 3);
  assert.equal(readTodoProjectId("4"), 4);
  assert.throws(() => readTodoProjectId(undefined), /projectId is required/);
  assert.throws(() => readTodoProjectId(0), /projectId must be a positive integer/);
});

test("readTodoCommentBody requires non-empty body", () => {
  assert.equal(readTodoCommentBody("  수정 댓글  "), "수정 댓글");
  assert.throws(() => readTodoCommentBody(""), /body is required/);
});

test("sortTodoMemos keeps open urgent todos first and completed todos below", () => {
  const memos: TodoMemo[] = [
    memo({ id: 1, dueDate: "2026-07-06", completedAt: null }),
    memo({ id: 2, dueDate: "2026-07-04", completedAt: "2026-07-03T10:00:00.000Z" }),
    memo({ id: 3, dueDate: "2026-07-04", completedAt: null }),
    memo({ id: 4, dueDate: "2026-07-05", completedAt: null }),
    memo({ id: 5, dueDate: null, completedAt: null }),
  ];

  assert.deepEqual(sortTodoMemos(memos).map((todo) => todo.id), [3, 4, 1, 5, 2]);
});

test("toggleCompletedAt completes and reopens todos", () => {
  assert.equal(toggleCompletedAt(null, new Date("2026-07-03T10:00:00.000Z")), "2026-07-03T10:00:00.000Z");
  assert.equal(toggleCompletedAt("2026-07-03T10:00:00.000Z", new Date("2026-07-03T11:00:00.000Z")), null);
});

test("deleteTodoCommentFromMemo removes only the target comment", () => {
  const result = deleteTodoCommentFromMemo(
    memo({
      comments: [
        { id: 1, todoMemoId: 1, body: "keep", createdAt: "2026-07-03T09:00:00.000Z" },
        { id: 2, todoMemoId: 1, body: "remove", createdAt: "2026-07-03T10:00:00.000Z" },
      ],
    }),
    2,
  );

  assert.deepEqual(result.comments.map((comment) => comment.body), ["keep"]);
});

function memo(overrides: Partial<TodoMemo> = {}): TodoMemo {
  return {
    id: 1,
    projectId: 1,
    title: "메모",
    content: "내용",
    color: "#1c69d4",
    dueDate: "2026-07-05",
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    completedAt: null,
    comments: [],
    ...overrides,
  };
}
