import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildProjectNodeTree,
  checkProjectHealth,
  isDescendantProjectNode,
  readProjectHealthTestInput,
  readProjectInput,
  readProjectNodeInput,
  readProjectNodeMoveInput,
  type ProjectNodeRow,
} from "./projects.js";

test("readProjectInput requires a project name", () => {
  assert.deepEqual(readProjectInput({ name: "  Work  ", description: "  Notes  " }), {
    name: "Work",
    description: "Notes",
    logoUrl: null,
    logoFileId: null,
    logoVariant: "black",
    healthApiUrl: null,
  });
  assert.deepEqual(readProjectInput({ name: "Work", description: "", healthApiUrl: "https://admin.suhan.dev/health" }), {
    name: "Work",
    description: null,
    logoUrl: null,
    logoFileId: null,
    logoVariant: "black",
    healthApiUrl: "https://admin.suhan.dev/health",
  });
  assert.throws(() => readProjectInput({ name: "" }), /name is required/);
});

test("readProjectInput accepts logo metadata and rejects invalid status URLs", () => {
  assert.deepEqual(
    readProjectInput({
      name: "Admin",
      logoFileId: 12,
      logoVariant: "white",
      healthApiUrl: "https://admin.suhan.dev/health",
    }),
    {
      name: "Admin",
      description: null,
      logoUrl: null,
      logoFileId: 12,
      logoVariant: "white",
      healthApiUrl: "https://admin.suhan.dev/health",
    },
  );
  assert.throws(() => readProjectInput({ name: "Admin", healthApiUrl: "ftp://admin.suhan.dev/health" }), /healthApiUrl must be an http\(s\) URL/);
  assert.throws(() => readProjectInput({ name: "Admin", logoVariant: "dark" }), /logoVariant must be black or white/);
});

test("readProjectHealthTestInput accepts status URLs only", () => {
  assert.deepEqual(readProjectHealthTestInput({ healthApiUrl: "https://admin.suhan.dev/health" }), {
    healthApiUrl: "https://admin.suhan.dev/health",
  });
});

test("readProjectNodeInput validates node type and document content", () => {
  assert.deepEqual(readProjectNodeInput({ type: "folder", title: " Docs ", parentId: null }), {
    type: "folder",
    title: "Docs",
    parentId: null,
    content: "",
  });
  assert.deepEqual(readProjectNodeInput({ type: "document", title: "Spec", content: "Body", parentId: 1 }), {
    type: "document",
    title: "Spec",
    parentId: 1,
    content: "Body",
  });
  assert.throws(() => readProjectNodeInput({ type: "link", title: "Spec" }), /type must be folder or document/);
});

test("buildProjectNodeTree hides inactive rows and sorts siblings", () => {
  const tree = buildProjectNodeTree([
    row({ id: 2, parentId: 1, title: "B", sortOrder: 2 }),
    row({ id: 1, parentId: null, title: "Root", sortOrder: 1, type: "folder" }),
    row({ id: 3, parentId: 1, title: "A", sortOrder: 1 }),
    row({ id: 4, parentId: null, title: "Deleted", isActive: false }),
  ]);

  assert.deepEqual(
    tree.map((node) => ({
      id: node.id,
      children: node.children.map((child) => child.id),
    })),
    [{ id: 1, children: [3, 2] }],
  );
});

test("readProjectNodeMoveInput validates parent and sort order", () => {
  assert.deepEqual(readProjectNodeMoveInput({ parentId: null, sortOrder: 0 }), {
    parentId: null,
    sortOrder: 0,
  });
  assert.deepEqual(readProjectNodeMoveInput({ parentId: 2, sortOrder: 3 }), {
    parentId: 2,
    sortOrder: 3,
  });
  assert.throws(() => readProjectNodeMoveInput({ parentId: -1, sortOrder: 0 }), /parentId must be a positive integer/);
  assert.throws(() => readProjectNodeMoveInput({ parentId: null, sortOrder: -1 }), /sortOrder must be a non-negative integer/);
});

test("isDescendantProjectNode rejects moving a node into itself or a child", () => {
  const rows = [
    row({ id: 1, parentId: null }),
    row({ id: 2, parentId: 1 }),
    row({ id: 3, parentId: 2 }),
  ];

  assert.equal(isDescendantProjectNode(rows, 1, 1), true);
  assert.equal(isDescendantProjectNode(rows, 1, 3), true);
  assert.equal(isDescendantProjectNode(rows, 2, 1), false);
  assert.equal(isDescendantProjectNode(rows, 1, null), false);
});

test("checkProjectHealth marks 2xx responses healthy with latency", async () => {
  const result = await checkProjectHealth(
    { healthApiUrl: "https://admin.suhan.dev/health" },
    async () => new Response(null, { status: 204 }),
    createClock(1_783_072_800_000, 1_783_072_800_125),
  );

  assert.equal(result.status, "healthy");
  assert.equal(result.statusCode, 204);
  assert.equal(result.responseTimeMs, 125);
  assert.equal(result.checkedAt.toISOString(), "2026-07-03T10:00:00.000Z");
});

test("checkProjectHealth records failed responses as unhealthy", async () => {
  const result = await checkProjectHealth(
    { healthApiUrl: "https://admin.suhan.dev/health" },
    async () => new Response(null, { status: 503 }),
    createClock(1_783_072_800_000, 1_783_072_800_090),
  );

  assert.equal(result.status, "unhealthy");
  assert.equal(result.statusCode, 503);
  assert.equal(result.responseTimeMs, 90);
  assert.equal(result.error, "HTTP 503");
});

function row(overrides: Partial<ProjectNodeRow> = {}): ProjectNodeRow {
  return {
    id: 1,
    projectId: 1,
    parentId: null,
    type: "document",
    title: "Node",
    content: "",
    sortOrder: 0,
    isActive: true,
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    updatedAt: new Date("2026-07-06T00:00:00.000Z"),
    ...overrides,
  };
}

function createClock(...times: number[]): () => number {
  return () => times.shift() ?? times.at(-1) ?? 0;
}
