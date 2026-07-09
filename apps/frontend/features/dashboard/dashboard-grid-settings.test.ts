import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arrangeDashboardWidgetLayout,
  getDashboardDotGridColumns,
  getDefaultDashboardWidgetLayout,
  getInvalidDashboardWidgetIds,
  migrateGaplessDashboardWidgetLayout,
  migrateLegacyDashboardWidgetLayout,
  migrateTightDashboardWidgetLayout,
  normalizeDashboardWidgetLayout,
  parseDashboardWidgetLayout,
  validateDashboardWidgetLayout,
} from "./dashboard-grid-settings.js";
import type { DashboardWidgetLayout } from "./dashboard-grid-settings.js";

const gridColumns = 67;
const defaultLayout = getDefaultDashboardWidgetLayout(gridColumns);

function assertLayoutsHaveOneDotGutter(layout: DashboardWidgetLayout[]) {
  for (let index = 0; index < layout.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < layout.length; otherIndex += 1) {
      const widget = layout[index];
      const otherWidget = layout[otherIndex];
      const isSeparated =
        widget.x + widget.w + 1 <= otherWidget.x ||
        otherWidget.x + otherWidget.w + 1 <= widget.x ||
        widget.y + widget.h + 1 <= otherWidget.y ||
        otherWidget.y + otherWidget.h + 1 <= widget.y;

      assert.equal(isSeparated, true, `${widget.id} should keep one dot gutter from ${otherWidget.id}`);
    }
  }
}

test("getDashboardDotGridColumns returns 24px snap columns", () => {
  assert.equal(getDashboardDotGridColumns(1617), 67);
});

test("getDefaultDashboardWidgetLayout leaves one dot column between side-by-side cards", () => {
  assert.deepEqual(getDefaultDashboardWidgetLayout(gridColumns).slice(0, 2), [
    { id: "review-prs", x: 0, y: 0, w: 33, h: 9 },
    { id: "todo", x: 34, y: 0, w: 33, h: 9 },
  ]);
});

test("parseDashboardWidgetLayout falls back to default layout for invalid JSON", () => {
  assert.deepEqual(parseDashboardWidgetLayout("not-json", gridColumns), defaultLayout);
});

test("parseDashboardWidgetLayout removes unknown widgets and appends missing widgets", () => {
  const layout = parseDashboardWidgetLayout(
    JSON.stringify([
      { id: "todo", x: 34, y: 0, w: 33, h: 9 },
      { id: "unknown", x: 0, y: 0, w: 2, h: 2 },
    ]),
    gridColumns,
  );

  assert.deepEqual(layout, [
    { id: "todo", x: 34, y: 0, w: 33, h: 9 },
    { id: "review-prs", x: 0, y: 0, w: 33, h: 9 },
    { id: "projects", x: 0, y: 10, w: 33, h: 9 },
    { id: "inbox", x: 34, y: 10, w: 33, h: 9 },
    { id: "slack-lists", x: 0, y: 20, w: 67, h: 9 },
    { id: "workspace-users", x: 0, y: 30, w: 67, h: 9 },
  ]);
  assertLayoutsHaveOneDotGutter(layout);
});

test("parseDashboardWidgetLayout repairs saved layouts that touch or overlap", () => {
  const layout = parseDashboardWidgetLayout(
    JSON.stringify([
      { id: "review-prs", x: 0, y: 0, w: 34, h: 9 },
      { id: "todo", x: 34, y: 0, w: 33, h: 9 },
      { id: "projects", x: 0, y: 9, w: 33, h: 9 },
    ]),
    gridColumns,
  );

  assert.deepEqual(layout.slice(0, 3), [
    { id: "review-prs", x: 0, y: 0, w: 33, h: 9 },
    { id: "todo", x: 34, y: 0, w: 33, h: 9 },
    { id: "projects", x: 0, y: 10, w: 33, h: 9 },
  ]);
  assertLayoutsHaveOneDotGutter(layout);
});

test("migrateLegacyDashboardWidgetLayout migrates old span-only widgets", () => {
  const layout = migrateLegacyDashboardWidgetLayout(JSON.stringify([{ id: "todo", colSpan: 2, rowSpan: 1 }]), gridColumns);

  assert.deepEqual(layout[0], { id: "todo", x: 0, y: 0, w: 67, h: 9 });
  assertLayoutsHaveOneDotGutter(layout);
});

test("migrateLegacyDashboardWidgetLayout scales saved two-column layouts to the dot grid", () => {
  const layout = migrateLegacyDashboardWidgetLayout(
    JSON.stringify([
      { id: "todo", x: 1, y: 0, w: 1, h: 1 },
      { id: "slack-lists", x: 0, y: 2, w: 2, h: 1 },
    ]),
    gridColumns,
  );

  assert.deepEqual(layout, [
    { id: "todo", x: 34, y: 0, w: 33, h: 9 },
    { id: "slack-lists", x: 0, y: 20, w: 67, h: 9 },
    { id: "review-prs", x: 0, y: 0, w: 33, h: 9 },
    { id: "projects", x: 0, y: 10, w: 33, h: 9 },
    { id: "inbox", x: 34, y: 10, w: 33, h: 9 },
    { id: "workspace-users", x: 0, y: 30, w: 67, h: 9 },
  ]);
  assertLayoutsHaveOneDotGutter(layout);
});

test("migrateGaplessDashboardWidgetLayout keeps a one dot column gutter", () => {
  const layout = migrateGaplessDashboardWidgetLayout(
    JSON.stringify([
      { id: "review-prs", x: 0, y: 0, w: 34, h: 19 },
      { id: "todo", x: 34, y: 0, w: 33, h: 19 },
    ]),
    gridColumns,
  );

  assert.deepEqual(layout.slice(0, 2), [
    { id: "review-prs", x: 0, y: 0, w: 33, h: 19 },
    { id: "todo", x: 34, y: 0, w: 33, h: 19 },
  ]);
  assertLayoutsHaveOneDotGutter(layout);
});

test("migrateTightDashboardWidgetLayout resets experimental tight layouts to the default guttered layout", () => {
  assert.deepEqual(
    migrateTightDashboardWidgetLayout(
      JSON.stringify([
        { id: "review-prs", x: 0, y: 0, w: 20, h: 11 },
        { id: "todo", x: 20, y: 0, w: 26, h: 19 },
        { id: "projects", x: 20, y: 19, w: 27, h: 9 },
      ]),
      gridColumns,
    ),
    defaultLayout,
  );
});

test("normalizeDashboardWidgetLayout keeps known widgets and clamps to the grid", () => {
  const layout = normalizeDashboardWidgetLayout(
    [
      { i: "todo", x: 70, y: 0, w: 70, h: 20 },
      { i: "unknown", x: 0, y: 0, w: 1, h: 1 },
      { i: "projects", x: 0, y: 2, w: 1, h: 1 },
    ],
    gridColumns,
  );

  assert.deepEqual(layout.slice(0, 2), [
    { id: "todo", x: 0, y: 0, w: 67, h: 20 },
    { id: "projects", x: 0, y: 21, w: 1, h: 1 },
  ]);
  assertLayoutsHaveOneDotGutter(layout);
});

test("normalizeDashboardWidgetLayout allows widget height beyond the column grid", () => {
  const layout = normalizeDashboardWidgetLayout([{ i: "todo", x: 0, y: 0, w: 1, h: 20 }], gridColumns);

  assert.deepEqual(layout[0], { id: "todo", x: 0, y: 0, w: 1, h: 20 });
  assertLayoutsHaveOneDotGutter(layout);
});

test("validateDashboardWidgetLayout rejects touching or overlapping edits instead of moving cards", () => {
  assert.equal(
    validateDashboardWidgetLayout(
      [
        { i: "review-prs", x: 0, y: 0, w: 33, h: 9 },
        { i: "todo", x: 33, y: 0, w: 33, h: 9 },
        { i: "projects", x: 0, y: 10, w: 33, h: 9 },
        { i: "inbox", x: 34, y: 10, w: 33, h: 9 },
        { i: "slack-lists", x: 0, y: 20, w: 67, h: 9 },
        { i: "workspace-users", x: 0, y: 30, w: 67, h: 9 },
      ],
      gridColumns,
    ),
    null,
  );
});

test("getInvalidDashboardWidgetIds returns only touching widgets", () => {
  assert.deepEqual(
    getInvalidDashboardWidgetIds(
      [
        { i: "review-prs", x: 0, y: 0, w: 33, h: 9 },
        { i: "todo", x: 33, y: 0, w: 33, h: 9 },
        { i: "projects", x: 0, y: 10, w: 33, h: 9 },
        { i: "inbox", x: 34, y: 10, w: 33, h: 9 },
        { i: "slack-lists", x: 0, y: 20, w: 67, h: 9 },
        { i: "workspace-users", x: 0, y: 30, w: 67, h: 9 },
      ],
      gridColumns,
    ),
    ["review-prs", "todo"],
  );
});

test("validateDashboardWidgetLayout accepts empty-space edits without auto arranging", () => {
  const layout = validateDashboardWidgetLayout(
    [
      { i: "review-prs", x: 0, y: 0, w: 33, h: 9 },
      { i: "todo", x: 34, y: 0, w: 33, h: 9 },
      { i: "projects", x: 0, y: 15, w: 33, h: 9 },
      { i: "inbox", x: 34, y: 10, w: 33, h: 9 },
      { i: "slack-lists", x: 0, y: 25, w: 67, h: 9 },
      { i: "workspace-users", x: 0, y: 35, w: 67, h: 9 },
    ],
    gridColumns,
  );

  assert.deepEqual(layout?.find((widget) => widget.id === "projects"), { id: "projects", x: 0, y: 15, w: 33, h: 9 });
});

test("arrangeDashboardWidgetLayout pulls cards upward without changing their columns", () => {
  const layout = arrangeDashboardWidgetLayout(
    [
      { id: "review-prs", x: 0, y: 20, w: 33, h: 9 },
      { id: "todo", x: 34, y: 20, w: 33, h: 9 },
      { id: "projects", x: 0, y: 40, w: 33, h: 9 },
      { id: "inbox", x: 34, y: 40, w: 33, h: 9 },
      { id: "slack-lists", x: 0, y: 60, w: 67, h: 9 },
      { id: "workspace-users", x: 0, y: 80, w: 67, h: 9 },
    ],
    gridColumns,
  );

  assert.deepEqual(layout.slice(0, 4), [
    { id: "review-prs", x: 0, y: 0, w: 33, h: 9 },
    { id: "todo", x: 34, y: 0, w: 33, h: 9 },
    { id: "projects", x: 0, y: 10, w: 33, h: 9 },
    { id: "inbox", x: 34, y: 10, w: 33, h: 9 },
  ]);
  assertLayoutsHaveOneDotGutter(layout);
});
