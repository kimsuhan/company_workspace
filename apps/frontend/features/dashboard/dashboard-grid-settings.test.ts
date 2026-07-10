import assert from "node:assert/strict";
import { test } from "node:test";

import {
  arrangeDashboardWidgetLayout,
  dashboardLegacyGridColumns as dashboardGridColumns,
  getDashboardDotGridColumns,
  getDashboardEditingMinRows,
  getDefaultDashboardWidgetLayout,
  getInvalidDashboardWidgetIds,
  migrateFixedDashboardWidgetLayout,
  migrateGutteredDashboardWidgetLayout,
  migrateGaplessDashboardWidgetLayout,
  migrateLegacyDashboardWidgetLayout,
  migrateLooseDashboardWidgetLayout,
  migrateTightDashboardWidgetLayout,
  normalizeDashboardWidgetLayout,
  parseDashboardWidgetLayout,
  validateDashboardWidgetLayout,
} from "./dashboard-grid-settings.js";
import type { DashboardWidgetLayout } from "./dashboard-grid-settings.js";

const defaultLayout = getDefaultDashboardWidgetLayout(dashboardGridColumns);

function assertLayoutsDoNotOverlap(layout: DashboardWidgetLayout[]) {
  for (let index = 0; index < layout.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < layout.length; otherIndex += 1) {
      const widget = layout[index];
      const otherWidget = layout[otherIndex];
      const isSeparated =
        widget.x + widget.w <= otherWidget.x ||
        otherWidget.x + otherWidget.w <= widget.x ||
        widget.y + widget.h <= otherWidget.y ||
        otherWidget.y + otherWidget.h <= widget.y;

      assert.equal(isSeparated, true, `${widget.id} should not overlap ${otherWidget.id}`);
    }
  }
}

test("getDashboardDotGridColumns returns 24px snap columns", () => {
  assert.equal(getDashboardDotGridColumns(1617), 67);
});

test("getDashboardEditingMinRows keeps the tallest editing canvas until completion", () => {
  const deepLayout = [{ id: "workspace-users", x: 8, y: 30, w: 4, h: 35 }] satisfies DashboardWidgetLayout[];
  const compactLayout = [{ id: "workspace-users", x: 8, y: 0, w: 4, h: 35 }] satisfies DashboardWidgetLayout[];

  assert.equal(getDashboardEditingMinRows(0, deepLayout), 65);
  assert.equal(getDashboardEditingMinRows(65, compactLayout), 65);
});

test("getDefaultDashboardWidgetLayout uses a fixed 12-column dashboard layout", () => {
  assert.deepEqual(defaultLayout, [
    { id: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
    { id: "inbox", x: 4, y: 0, w: 4, h: 9 },
    { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
    { id: "projects", x: 0, y: 15, w: 4, h: 24 },
    { id: "review-prs", x: 4, y: 9, w: 4, h: 9 },
    { id: "todo", x: 4, y: 18, w: 4, h: 24 },
  ]);
  assertLayoutsDoNotOverlap(defaultLayout);
});

test("getDefaultDashboardWidgetLayout uses the full dot grid instead of three fixed slots", () => {
  const layout = getDefaultDashboardWidgetLayout(getDashboardDotGridColumns(1617));

  assert.deepEqual(layout.slice(0, 3), [
    { id: "slack-lists", x: 0, y: 0, w: 22, h: 15 },
    { id: "inbox", x: 22, y: 0, w: 22, h: 9 },
    { id: "workspace-users", x: 44, y: 0, w: 23, h: 35 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("migrateFixedDashboardWidgetLayout expands saved 12-column positions onto the dot grid", () => {
  const layout = migrateFixedDashboardWidgetLayout(
    JSON.stringify([
      { id: "slack-lists", x: 0, y: 0, w: 6, h: 15 },
      { id: "inbox", x: 6, y: 0, w: 2, h: 9 },
      { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
      { id: "projects", x: 0, y: 15, w: 6, h: 24 },
      { id: "review-prs", x: 6, y: 9, w: 2, h: 9 },
      { id: "todo", x: 6, y: 18, w: 2, h: 24 },
    ]),
    getDashboardDotGridColumns(1617),
  );

  assert.deepEqual(layout.slice(0, 3), [
    { id: "slack-lists", x: 0, y: 0, w: 34, h: 15 },
    { id: "inbox", x: 34, y: 0, w: 11, h: 9 },
    { id: "workspace-users", x: 45, y: 0, w: 22, h: 35 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("parseDashboardWidgetLayout falls back to default layout for invalid JSON", () => {
  assert.deepEqual(parseDashboardWidgetLayout("not-json", dashboardGridColumns), defaultLayout);
});

test("parseDashboardWidgetLayout ignores object-shaped experimental saved layouts", () => {
  const layout = parseDashboardWidgetLayout(
    JSON.stringify({
      gridColumns: 174,
      layout: [{ id: "workspace-users", x: 121, y: 0, w: 53, h: 30 }],
    }),
    dashboardGridColumns,
  );

  assert.deepEqual(layout, defaultLayout);
});

test("parseDashboardWidgetLayout removes unknown widgets and appends missing widgets", () => {
  const layout = parseDashboardWidgetLayout(
    JSON.stringify([
      { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
      { id: "unknown", x: 0, y: 0, w: 2, h: 2 },
    ]),
    dashboardGridColumns,
  );

  assert.deepEqual(layout, [
    { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
    { id: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
    { id: "inbox", x: 4, y: 0, w: 4, h: 9 },
    { id: "projects", x: 0, y: 15, w: 4, h: 24 },
    { id: "review-prs", x: 4, y: 9, w: 4, h: 9 },
    { id: "todo", x: 4, y: 18, w: 4, h: 24 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("parseDashboardWidgetLayout repairs saved layouts that touch or overlap", () => {
  const layout = parseDashboardWidgetLayout(
    JSON.stringify([
      { id: "slack-lists", x: 0, y: 0, w: 5, h: 15 },
      { id: "inbox", x: 4, y: 0, w: 3, h: 9 },
      { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
    ]),
    dashboardGridColumns,
  );

  assert.deepEqual(layout.slice(0, 3), [
    { id: "slack-lists", x: 0, y: 0, w: 5, h: 15 },
    { id: "inbox", x: 4, y: 15, w: 3, h: 9 },
    { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("migrateLegacyDashboardWidgetLayout migrates old span-only widgets", () => {
  const layout = migrateLegacyDashboardWidgetLayout(JSON.stringify([{ id: "todo", colSpan: 2, rowSpan: 1 }]), dashboardGridColumns);

  assert.deepEqual(layout[0], { id: "todo", x: 0, y: 0, w: 12, h: 9 });
  assertLayoutsDoNotOverlap(layout);
});

test("migrateLegacyDashboardWidgetLayout scales saved two-column layouts to the fixed 12-column grid", () => {
  const layout = migrateLegacyDashboardWidgetLayout(
    JSON.stringify([
      { id: "todo", x: 1, y: 0, w: 1, h: 1 },
      { id: "slack-lists", x: 0, y: 2, w: 2, h: 1 },
    ]),
    dashboardGridColumns,
  );

  assert.deepEqual(layout, [
    { id: "todo", x: 6, y: 0, w: 6, h: 9 },
    { id: "slack-lists", x: 0, y: 20, w: 12, h: 9 },
    { id: "review-prs", x: 0, y: 0, w: 4, h: 9 },
    { id: "projects", x: 0, y: 10, w: 4, h: 9 },
    { id: "inbox", x: 6, y: 10, w: 6, h: 9 },
    { id: "workspace-users", x: 0, y: 30, w: 12, h: 9 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("migrateGaplessDashboardWidgetLayout maps old half-width widgets to the current default width", () => {
  const layout = migrateGaplessDashboardWidgetLayout(
    JSON.stringify([
      { id: "review-prs", x: 0, y: 0, w: 6, h: 19 },
      { id: "todo", x: 6, y: 0, w: 6, h: 19 },
    ]),
    dashboardGridColumns,
  );

  assert.deepEqual(layout.slice(0, 2), [
    { id: "review-prs", x: 0, y: 0, w: 4, h: 19 },
    { id: "todo", x: 6, y: 0, w: 6, h: 19 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("migrateGutteredDashboardWidgetLayout expands the previous 3/3/4 column layout", () => {
  const layout = migrateGutteredDashboardWidgetLayout(
    JSON.stringify([
      { id: "slack-lists", x: 0, y: 0, w: 3, h: 15 },
      { id: "review-prs", x: 4, y: 0, w: 3, h: 9 },
      { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
    ]),
    dashboardGridColumns,
  );

  assert.deepEqual(layout.slice(0, 3), [
    { id: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
    { id: "review-prs", x: 4, y: 0, w: 4, h: 9 },
    { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("migrateLooseDashboardWidgetLayout removes one-row gaps from the previous 12-column layout", () => {
  const layout = migrateLooseDashboardWidgetLayout(
    JSON.stringify([
      { id: "inbox", x: 4, y: 0, w: 4, h: 9 },
      { id: "review-prs", x: 4, y: 10, w: 4, h: 9 },
      { id: "todo", x: 4, y: 20, w: 4, h: 24 },
      { id: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
      { id: "projects", x: 0, y: 16, w: 4, h: 24 },
      { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
    ]),
    dashboardGridColumns,
  );

  assert.deepEqual(layout.slice(0, 3), [
    { id: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
    { id: "inbox", x: 4, y: 0, w: 4, h: 9 },
    { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
  ]);
  assert.deepEqual(layout.find((widget) => widget.id === "review-prs"), { id: "review-prs", x: 4, y: 9, w: 4, h: 9 });
  assert.deepEqual(layout.find((widget) => widget.id === "todo"), { id: "todo", x: 4, y: 18, w: 4, h: 24 });
  assert.deepEqual(layout.find((widget) => widget.id === "projects"), { id: "projects", x: 0, y: 15, w: 4, h: 24 });
  assertLayoutsDoNotOverlap(layout);
});

test("migrateTightDashboardWidgetLayout resets experimental tight layouts to the default guttered layout", () => {
  assert.deepEqual(
    migrateTightDashboardWidgetLayout(
      JSON.stringify([
        { id: "review-prs", x: 0, y: 0, w: 4, h: 11 },
        { id: "todo", x: 4, y: 0, w: 3, h: 19 },
      ]),
      dashboardGridColumns,
    ),
    defaultLayout,
  );
});

test("normalizeDashboardWidgetLayout keeps known widgets and clamps to the grid", () => {
  const layout = normalizeDashboardWidgetLayout(
    [
      { i: "todo", x: 20, y: 0, w: 20, h: 20 },
      { i: "unknown", x: 0, y: 0, w: 1, h: 1 },
      { i: "projects", x: 0, y: 2, w: 1, h: 1 },
    ],
    dashboardGridColumns,
  );

  assert.deepEqual(layout.slice(0, 2), [
    { id: "todo", x: 0, y: 0, w: 12, h: 20 },
    { id: "projects", x: 0, y: 20, w: 1, h: 1 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});

test("normalizeDashboardWidgetLayout allows widget height beyond the column grid", () => {
  const layout = normalizeDashboardWidgetLayout([{ i: "todo", x: 0, y: 0, w: 1, h: 20 }], dashboardGridColumns);

  assert.deepEqual(layout[0], { id: "todo", x: 0, y: 0, w: 1, h: 20 });
  assertLayoutsDoNotOverlap(layout);
});

test("validateDashboardWidgetLayout accepts cards whose edges touch", () => {
  const layout = validateDashboardWidgetLayout(
    [
      { i: "slack-lists", x: 0, y: 0, w: 4, h: 9 },
      { i: "inbox", x: 4, y: 0, w: 4, h: 9 },
      { i: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
      { i: "projects", x: 0, y: 15, w: 4, h: 24 },
      { i: "review-prs", x: 4, y: 9, w: 4, h: 9 },
      { i: "todo", x: 4, y: 18, w: 4, h: 24 },
    ],
    dashboardGridColumns,
  );

  assert.notEqual(layout, null);
});

test("validateDashboardWidgetLayout accepts vertically stacked cards with no row gap", () => {
  const layout = validateDashboardWidgetLayout(
    [
      { i: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
      { i: "projects", x: 0, y: 15, w: 4, h: 24 },
      { i: "inbox", x: 4, y: 0, w: 4, h: 9 },
      { i: "review-prs", x: 4, y: 9, w: 4, h: 9 },
      { i: "todo", x: 4, y: 18, w: 4, h: 24 },
      { i: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
    ],
    dashboardGridColumns,
  );

  assert.notEqual(layout, null);
});

test("getInvalidDashboardWidgetIds returns only overlapping widgets", () => {
  assert.deepEqual(
    getInvalidDashboardWidgetIds(
      [
        { i: "slack-lists", x: 0, y: 0, w: 5, h: 9 },
        { i: "inbox", x: 4, y: 0, w: 4, h: 9 },
        { i: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
        { i: "projects", x: 0, y: 15, w: 4, h: 24 },
        { i: "review-prs", x: 4, y: 9, w: 4, h: 9 },
        { i: "todo", x: 4, y: 18, w: 4, h: 24 },
      ],
      dashboardGridColumns,
    ),
    ["slack-lists", "inbox"],
  );
});

test("validateDashboardWidgetLayout accepts empty-space edits without auto arranging", () => {
  const layout = validateDashboardWidgetLayout(
    [
      { i: "slack-lists", x: 0, y: 0, w: 3, h: 15 },
      { i: "inbox", x: 4, y: 0, w: 4, h: 9 },
      { i: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
      { i: "projects", x: 0, y: 18, w: 4, h: 24 },
      { i: "review-prs", x: 4, y: 9, w: 4, h: 9 },
      { i: "todo", x: 4, y: 18, w: 4, h: 24 },
    ],
    dashboardGridColumns,
  );

  assert.deepEqual(layout?.find((widget) => widget.id === "projects"), { id: "projects", x: 0, y: 18, w: 4, h: 24 });
});

test("arrangeDashboardWidgetLayout pulls cards upward without changing their columns", () => {
  const layout = arrangeDashboardWidgetLayout(
    [
      { id: "slack-lists", x: 0, y: 20, w: 4, h: 15 },
      { id: "inbox", x: 4, y: 20, w: 4, h: 9 },
      { id: "workspace-users", x: 8, y: 20, w: 4, h: 35 },
      { id: "projects", x: 0, y: 50, w: 4, h: 24 },
      { id: "review-prs", x: 4, y: 40, w: 4, h: 9 },
      { id: "todo", x: 4, y: 60, w: 4, h: 24 },
    ],
    dashboardGridColumns,
  );

  assert.deepEqual(layout.slice(0, 3), [
    { id: "slack-lists", x: 0, y: 0, w: 4, h: 15 },
    { id: "inbox", x: 4, y: 0, w: 4, h: 9 },
    { id: "workspace-users", x: 8, y: 0, w: 4, h: 35 },
  ]);
  assertLayoutsDoNotOverlap(layout);
});
