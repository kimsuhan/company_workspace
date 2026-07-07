import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultDashboardWidgetLayout,
  normalizeDashboardWidgetLayout,
  parseDashboardGridLayout,
  parseDashboardGridSize,
  parseDashboardWidgetLayout,
} from "./dashboard-grid-settings.js";

test("parseDashboardGridSize accepts only 1 through 5", () => {
  assert.equal(parseDashboardGridSize("1"), 1);
  assert.equal(parseDashboardGridSize("12"), 12);
  assert.equal(parseDashboardGridSize("13"), 2);
  assert.equal(parseDashboardGridSize("abc"), 2);
  assert.equal(parseDashboardGridSize(null), 2);
});

test("parseDashboardGridLayout reads square legacy values and custom dimensions", () => {
  assert.deepEqual(parseDashboardGridLayout("3"), { cols: 3, rows: 3 });
  assert.deepEqual(parseDashboardGridLayout("4x6"), { cols: 4, rows: 6 });
  assert.deepEqual(parseDashboardGridLayout("13x2"), { cols: 2, rows: 2 });
  assert.deepEqual(parseDashboardGridLayout("abc"), { cols: 2, rows: 2 });
});

test("parseDashboardWidgetLayout falls back to default layout for invalid JSON", () => {
  assert.deepEqual(parseDashboardWidgetLayout("not-json"), defaultDashboardWidgetLayout);
});

test("parseDashboardWidgetLayout removes unknown widgets and appends missing widgets", () => {
  assert.deepEqual(
    parseDashboardWidgetLayout(
      JSON.stringify([
        { id: "todo", x: 1, y: 0, w: 2, h: 1 },
        { id: "unknown", x: 0, y: 0, w: 2, h: 2 },
      ]),
    ),
    [
      { id: "todo", x: 1, y: 0, w: 2, h: 1 },
      { id: "review-prs", x: 0, y: 0, w: 1, h: 1 },
      { id: "projects", x: 0, y: 1, w: 1, h: 1 },
    ],
  );
});

test("parseDashboardWidgetLayout migrates old span-only widgets", () => {
  assert.deepEqual(
    parseDashboardWidgetLayout(JSON.stringify([{ id: "todo", colSpan: 2, rowSpan: 1 }])),
    [
      { id: "todo", x: 1, y: 0, w: 2, h: 1 },
      { id: "review-prs", x: 0, y: 0, w: 1, h: 1 },
      { id: "projects", x: 0, y: 1, w: 1, h: 1 },
    ],
  );
});

test("normalizeDashboardWidgetLayout keeps known widgets and clamps to the grid", () => {
  assert.deepEqual(
    normalizeDashboardWidgetLayout(
      [
        { i: "todo", x: 4, y: 0, w: 4, h: 2 },
        { i: "unknown", x: 0, y: 0, w: 1, h: 1 },
        { i: "projects", x: 0, y: 2, w: 1, h: 1 },
      ],
      3,
    ),
    [
      { id: "todo", x: 0, y: 0, w: 3, h: 2 },
      { id: "projects", x: 0, y: 2, w: 1, h: 1 },
      { id: "review-prs", x: 0, y: 0, w: 1, h: 1 },
    ],
  );
});

test("normalizeDashboardWidgetLayout allows widget height beyond the column grid", () => {
  assert.deepEqual(normalizeDashboardWidgetLayout([{ i: "todo", x: 0, y: 0, w: 1, h: 5 }], 2), [
    { id: "todo", x: 0, y: 0, w: 1, h: 5 },
    { id: "review-prs", x: 0, y: 0, w: 1, h: 1 },
    { id: "projects", x: 0, y: 1, w: 1, h: 1 },
  ]);
});
