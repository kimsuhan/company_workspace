export const dashboardLegacyWidgetLayoutStorageKey = "suhan-dashboard-widget-layout";
export const dashboardGaplessWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v2";
export const dashboardTightWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v3";
export const dashboardPreviousWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v4";
export const dashboardBrokenWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v5";
export const dashboardGutteredWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v6";
export const dashboardLooseWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v7";
export const dashboardFixedWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v8";
export const dashboardWidgetLayoutStorageKey = "suhan-dashboard-widget-layout-v9";
export const dashboardGridDotSize = 24;
export const dashboardLegacyGridColumns = 12;
export const dashboardWidgetMaxRows = 80;
const dashboardWidgetGapColumns = 0;
export const dashboardWidgetIds = ["review-prs", "todo", "projects", "inbox", "slack-lists", "workspace-users"] as const;

export type DashboardWidgetId = (typeof dashboardWidgetIds)[number];

export type DashboardWidgetLayout = {
  id: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function getDashboardEditingMinRows(currentRows: number, layout: DashboardWidgetLayout[]) {
  return Math.max(currentRows, 0, ...layout.map((widget) => widget.y + widget.h));
}

type GridLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function getDashboardDotGridColumns(width: number) {
  return Math.max(1, Math.floor(width / dashboardGridDotSize));
}

export function getDefaultDashboardWidgetLayout(gridColumns: number): DashboardWidgetLayout[] {
  if (gridColumns < 3) {
    return [
      { id: "slack-lists", x: 0, y: 0, w: gridColumns, h: 15 },
      { id: "inbox", x: 0, y: 15, w: gridColumns, h: 9 },
      { id: "workspace-users", x: 0, y: 24, w: gridColumns, h: 35 },
      { id: "projects", x: 0, y: 59, w: gridColumns, h: 24 },
      { id: "review-prs", x: 0, y: 83, w: gridColumns, h: 9 },
      { id: "todo", x: 0, y: 92, w: gridColumns, h: 24 },
    ];
  }

  const leftWidth = Math.floor(gridColumns / 3);
  const middleWidth = Math.floor((gridColumns - leftWidth) / 2);
  const rightX = leftWidth + middleWidth;
  const rightWidth = gridColumns - rightX;

  return [
    { id: "slack-lists", x: 0, y: 0, w: leftWidth, h: 15 },
    { id: "inbox", x: leftWidth, y: 0, w: middleWidth, h: 9 },
    { id: "workspace-users", x: rightX, y: 0, w: rightWidth, h: 35 },
    { id: "projects", x: 0, y: 15, w: leftWidth, h: 24 },
    { id: "review-prs", x: leftWidth, y: 9, w: middleWidth, h: 9 },
    { id: "todo", x: leftWidth, y: 18, w: middleWidth, h: 24 },
  ];
}

export function parseDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  if (!value) {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return getDefaultDashboardWidgetLayout(gridColumns);
    }

    return normalizeDashboardWidgets(
      addDashboardWidgetGutters(
        parseDashboardWidgetLayoutItems(parsed, getDefaultDashboardWidgetLayout(gridColumns), gridColumns, dashboardWidgetMaxRows),
        gridColumns,
      ),
      gridColumns,
    );
  } catch {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }
}

export function migrateLegacyDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  if (!value) {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return getDefaultDashboardWidgetLayout(gridColumns);
    }

    const hasLegacySpanOnlyWidget = parsed.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const { x, w, colSpan, rowSpan } = item as { x?: unknown; w?: unknown; colSpan?: unknown; rowSpan?: unknown };
      return (colSpan !== undefined || rowSpan !== undefined) && x === undefined && w === undefined;
    });
    const sourceColumns = hasLegacySpanOnlyWidget || isSavedTwoColumnLayout(parsed) ? 2 : dashboardLegacyGridColumns;
    const parsedLayout = parseDashboardWidgetLayoutItems(
      parsed,
      sourceColumns === 2 ? getLegacyTwoColumnDashboardWidgetLayout() : getLegacyTwelveColumnDashboardWidgetLayout(),
      sourceColumns,
      dashboardWidgetMaxRows,
    );

    return normalizeDashboardWidgets(
      addDashboardWidgetGutters(scaleLegacyDashboardWidgetLayout(parsedLayout, sourceColumns, gridColumns), gridColumns),
      gridColumns,
    );
  } catch {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }
}

export function migrateGaplessDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  if (!value) {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return getDefaultDashboardWidgetLayout(gridColumns);
    }

    return normalizeDashboardWidgets(
      addDashboardWidgetGutters(
        parseDashboardWidgetLayoutItems(parsed, getDefaultDashboardWidgetLayout(gridColumns), gridColumns, dashboardWidgetMaxRows),
        gridColumns,
      ),
      gridColumns,
    );
  } catch {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }
}

export function migrateTightDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  return getDefaultDashboardWidgetLayout(gridColumns);
}

export function migrateFixedDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  if (!value) {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return getDefaultDashboardWidgetLayout(gridColumns);
    }

    const layout = normalizeDashboardWidgets(
      parseDashboardWidgetLayoutItems(
        parsed,
        getDefaultDashboardWidgetLayout(dashboardLegacyGridColumns),
        dashboardLegacyGridColumns,
        dashboardWidgetMaxRows,
      ),
      dashboardLegacyGridColumns,
    );

    return normalizeDashboardWidgets(
      scaleDashboardWidgetLayout(layout, dashboardLegacyGridColumns, gridColumns),
      gridColumns,
    );
  } catch {
    return getDefaultDashboardWidgetLayout(gridColumns);
  }
}

export function migrateGutteredDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  const layout = parseDashboardWidgetLayout(value, dashboardLegacyGridColumns).map((widget) =>
    expandGutteredDashboardWidget(widget, dashboardLegacyGridColumns),
  );

  return normalizeDashboardWidgets(scaleDashboardWidgetLayout(layout, dashboardLegacyGridColumns, gridColumns), gridColumns);
}

export function migrateLooseDashboardWidgetLayout(value: string | null, gridColumns: number): DashboardWidgetLayout[] {
  const layout = arrangeDashboardWidgetLayout(
    parseDashboardWidgetLayout(value, dashboardLegacyGridColumns),
    dashboardLegacyGridColumns,
  );

  return normalizeDashboardWidgets(scaleDashboardWidgetLayout(layout, dashboardLegacyGridColumns, gridColumns), gridColumns);
}

function expandGutteredDashboardWidget(widget: DashboardWidgetLayout, gridColumns: number) {
  if (gridColumns !== dashboardLegacyGridColumns || widget.w !== 3 || (widget.x !== 0 && widget.x !== 4)) {
    return widget;
  }

  return { ...widget, w: 4 };
}

function scaleDashboardWidgetLayout(layout: DashboardWidgetLayout[], sourceColumns: number, targetColumns: number) {
  if (sourceColumns === targetColumns) {
    return layout;
  }

  return layout.map((widget) => {
    const x = Math.round((widget.x / sourceColumns) * targetColumns);
    const right = Math.round(((widget.x + widget.w) / sourceColumns) * targetColumns);
    const width = clampGridNumber(right - x, 1, targetColumns);

    return {
      ...widget,
      x: clampGridNumber(x, 0, targetColumns - width),
      w: width,
    };
  });
}

function addDashboardWidgetGutters(layout: DashboardWidgetLayout[], gridColumns: number) {
  const defaultLayout = getDefaultDashboardWidgetLayout(gridColumns);
  const gaplessLeftColumnWidth = Math.ceil(gridColumns / 2);

  return layout.map((widget) => {
    const defaultWidget = getDefaultDashboardWidget(widget.id, defaultLayout);

    if (widget.x === 0 && widget.w === gaplessLeftColumnWidth) {
      return { ...widget, w: defaultWidget.w };
    }

    return widget;
  });
}

function parseDashboardWidgetLayoutItems(
  parsed: unknown[],
  defaultLayout: DashboardWidgetLayout[],
  maxColumns: number,
  maxRows: number,
) {
  const layout: DashboardWidgetLayout[] = [];
  const seenIds = new Set<DashboardWidgetId>();

  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const { id, x, y, w, h, colSpan, rowSpan } = item as {
      id?: unknown;
      x?: unknown;
      y?: unknown;
      w?: unknown;
      h?: unknown;
      colSpan?: unknown;
      rowSpan?: unknown;
    };

    if (!isDashboardWidgetId(id) || seenIds.has(id)) {
      continue;
    }

    const defaultWidget = getDefaultDashboardWidget(id, defaultLayout);
    seenIds.add(id);
    layout.push({
      id,
      x: getSafeGridNumber(x, defaultWidget.x),
      y: getSafeGridNumber(y, defaultWidget.y),
      w: getSafeGridSize(w ?? colSpan, defaultWidget.w, maxColumns),
      h: getSafeGridSize(h ?? rowSpan, defaultWidget.h, maxRows),
    });
  }

  for (const widget of defaultLayout) {
    if (!seenIds.has(widget.id)) {
      layout.push({ ...widget });
    }
  }

  return layout.length > 0 ? layout : cloneDashboardWidgetLayout(defaultLayout);
}

export function normalizeDashboardWidgetLayout(layout: ReadonlyArray<GridLayoutItem>, gridSize: number): DashboardWidgetLayout[] {
  const parsedLayout: DashboardWidgetLayout[] = [];

  for (const item of layout) {
    if (!isDashboardWidgetId(item.i)) {
      continue;
    }

    parsedLayout.push({
      id: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    });
  }

  return normalizeDashboardWidgets(parsedLayout, gridSize);
}

export function validateDashboardWidgetLayout(layout: ReadonlyArray<GridLayoutItem>, gridSize: number): DashboardWidgetLayout[] | null {
  const normalized = parseDashboardGridItems(layout, gridSize);

  if (!normalized) {
    return null;
  }

  return hasDashboardWidgetCollision(normalized) ? null : normalized;
}

export function getInvalidDashboardWidgetIds(layout: ReadonlyArray<GridLayoutItem>, gridSize: number): DashboardWidgetId[] {
  const normalized = parseDashboardGridItems(layout, gridSize);

  if (!normalized) {
    return [...dashboardWidgetIds];
  }

  const invalidWidgetIds = new Set<DashboardWidgetId>();

  for (let index = 0; index < normalized.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < normalized.length; otherIndex += 1) {
      if (doDashboardWidgetsTouch(normalized[index], normalized[otherIndex])) {
        invalidWidgetIds.add(normalized[index].id);
        invalidWidgetIds.add(normalized[otherIndex].id);
      }
    }
  }

  return [...invalidWidgetIds];
}

function parseDashboardGridItems(layout: ReadonlyArray<GridLayoutItem>, gridSize: number) {
  const seenIds = new Set<DashboardWidgetId>();
  const normalized: DashboardWidgetLayout[] = [];

  for (const item of layout) {
    if (!isDashboardWidgetId(item.i) || seenIds.has(item.i)) {
      continue;
    }

    seenIds.add(item.i);
    const width = clampGridNumber(item.w, 1, gridSize);
    const height = clampGridNumber(item.h, 1, dashboardWidgetMaxRows);
    normalized.push({
      id: item.i,
      x: clampGridNumber(item.x, 0, gridSize - width),
      y: Math.max(0, Math.floor(item.y)),
      w: width,
      h: height,
    });
  }

  if (normalized.length !== dashboardWidgetIds.length) {
    return null;
  }

  return normalized;
}

export function arrangeDashboardWidgetLayout(layout: DashboardWidgetLayout[], gridSize: number): DashboardWidgetLayout[] {
  const placed: DashboardWidgetLayout[] = [];
  const normalized = normalizeDashboardWidgets(layout, gridSize).sort((widget, otherWidget) => widget.y - otherWidget.y || widget.x - otherWidget.x);

  for (const widget of normalized) {
    let nextWidget = { ...widget, y: 0 };

    while (placed.some((placedWidget) => doDashboardWidgetsTouch(nextWidget, placedWidget))) {
      nextWidget = { ...nextWidget, y: nextWidget.y + 1 };
    }

    placed.push(nextWidget);
  }

  return placed;
}

function normalizeDashboardWidgets(layout: DashboardWidgetLayout[], gridSize: number): DashboardWidgetLayout[] {
  const seenIds = new Set<DashboardWidgetId>();
  const normalized: DashboardWidgetLayout[] = [];

  for (const item of layout) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    const width = clampGridNumber(item.w, 1, gridSize);
    const height = clampGridNumber(item.h, 1, dashboardWidgetMaxRows);
    normalized.push({
      id: item.id,
      x: clampGridNumber(item.x, 0, gridSize - width),
      y: Math.max(0, Math.floor(item.y)),
      w: width,
      h: height,
    });
  }

  for (const widget of getDefaultDashboardWidgetLayout(gridSize)) {
    if (!seenIds.has(widget.id)) {
      normalized.push({ ...widget });
    }
  }

  return placeDashboardWidgetsWithGutters(normalized);
}

export function serializeDashboardWidgetLayout(layout: DashboardWidgetLayout[]): string {
  return JSON.stringify(layout);
}

function placeDashboardWidgetsWithGutters(layout: DashboardWidgetLayout[]) {
  const placed: DashboardWidgetLayout[] = [];

  for (const widget of layout) {
    const nextWidget = { ...widget };
    let collidingWidget = placed.find((otherWidget) => doDashboardWidgetsTouch(nextWidget, otherWidget));

    while (collidingWidget) {
      nextWidget.y = collidingWidget.y + collidingWidget.h + dashboardWidgetGapColumns;
      collidingWidget = placed.find((otherWidget) => doDashboardWidgetsTouch(nextWidget, otherWidget));
    }

    placed.push(nextWidget);
  }

  return placed;
}

function hasDashboardWidgetCollision(layout: DashboardWidgetLayout[]) {
  for (let index = 0; index < layout.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < layout.length; otherIndex += 1) {
      if (doDashboardWidgetsTouch(layout[index], layout[otherIndex])) {
        return true;
      }
    }
  }

  return false;
}

function doDashboardWidgetsTouch(widget: DashboardWidgetLayout, otherWidget: DashboardWidgetLayout) {
  return !(
    widget.x + widget.w + dashboardWidgetGapColumns <= otherWidget.x ||
    otherWidget.x + otherWidget.w + dashboardWidgetGapColumns <= widget.x ||
    widget.y + widget.h + dashboardWidgetGapColumns <= otherWidget.y ||
    otherWidget.y + otherWidget.h + dashboardWidgetGapColumns <= widget.y
  );
}

function cloneDashboardWidgetLayout(layout: DashboardWidgetLayout[]): DashboardWidgetLayout[] {
  return layout.map((widget) => ({ ...widget }));
}

function getDefaultDashboardWidget(id: DashboardWidgetId, defaultLayout: DashboardWidgetLayout[]) {
  return defaultLayout.find((widget) => widget.id === id) ?? defaultLayout[0];
}

function getSafeGridNumber(value: unknown, fallback: number) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function getSafeGridSize(value: unknown, fallback: number, max: number) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= max ? Number(value) : fallback;
}

function isSavedTwoColumnLayout(layout: unknown[]) {
  return layout.length > 0 && layout.every((item) => {
    if (!item || typeof item !== "object") {
      return true;
    }

    const { x, w } = item as { x?: unknown; w?: unknown };
    const column = x === undefined ? 0 : Number(x);
    const width = w === undefined ? 1 : Number(w);

    return Number.isInteger(column) && Number.isInteger(width) && column <= 1 && width <= 2;
  });
}

function scaleLegacyDashboardWidgetLayout(layout: DashboardWidgetLayout[], sourceColumns: number, targetColumns: number) {
  return layout.map((widget) => {
    const x = Math.round((widget.x / sourceColumns) * targetColumns);
    const right = Math.round(((widget.x + widget.w) / sourceColumns) * targetColumns);
    const oldTop = widget.y * 236;
    const oldHeight = widget.h * 220 + Math.max(0, widget.h - 1) * 16;
    const width = clampGridNumber(right - x, 1, targetColumns);

    return {
      ...widget,
      x: clampGridNumber(x, 0, targetColumns - width),
      y: Math.max(0, Math.round(oldTop / dashboardGridDotSize)),
      w: width,
      h: clampGridNumber(Math.round(oldHeight / dashboardGridDotSize), 1, dashboardWidgetMaxRows),
    };
  });
}

function getLegacyTwoColumnDashboardWidgetLayout(): DashboardWidgetLayout[] {
  return [
    { id: "review-prs", x: 0, y: 0, w: 1, h: 1 },
    { id: "todo", x: 1, y: 0, w: 1, h: 1 },
    { id: "projects", x: 0, y: 1, w: 1, h: 1 },
    { id: "inbox", x: 1, y: 1, w: 1, h: 1 },
    { id: "slack-lists", x: 0, y: 2, w: 2, h: 1 },
    { id: "workspace-users", x: 0, y: 3, w: 2, h: 1 },
  ];
}

function getLegacyTwelveColumnDashboardWidgetLayout(): DashboardWidgetLayout[] {
  return [
    { id: "review-prs", x: 0, y: 0, w: 6, h: 1 },
    { id: "todo", x: 6, y: 0, w: 6, h: 1 },
    { id: "projects", x: 0, y: 1, w: 6, h: 1 },
    { id: "inbox", x: 6, y: 1, w: 6, h: 1 },
    { id: "slack-lists", x: 0, y: 2, w: 12, h: 1 },
    { id: "workspace-users", x: 0, y: 3, w: 12, h: 1 },
  ];
}

function clampGridNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max);
}

export function isDashboardWidgetId(id: unknown): id is DashboardWidgetId {
  return dashboardWidgetIds.includes(id as DashboardWidgetId);
}
