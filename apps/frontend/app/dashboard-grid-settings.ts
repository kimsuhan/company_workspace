export const dashboardGridStorageKey = "suhan-dashboard-grid-size";
export const dashboardWidgetLayoutStorageKey = "suhan-dashboard-widget-layout";
export const defaultDashboardGridSize = 2;
export const defaultDashboardGridLayout = { cols: 2, rows: 2 };
export const dashboardGridSizes = [1, 2, 3, 4, 5];
export const dashboardGridMaxSize = 12;
export const dashboardWidgetMaxRows = 5;
export const dashboardWidgetIds = ["review-prs", "todo", "projects", "inbox", "slack-lists", "workspace-users"] as const;

export type DashboardWidgetId = (typeof dashboardWidgetIds)[number];

export type DashboardGridLayout = {
  cols: number;
  rows: number;
};

export type DashboardWidgetLayout = {
  id: DashboardWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const defaultDashboardWidgetLayout: DashboardWidgetLayout[] = [
  { id: "review-prs", x: 0, y: 0, w: 1, h: 1 },
  { id: "todo", x: 1, y: 0, w: 1, h: 1 },
  { id: "projects", x: 0, y: 1, w: 1, h: 1 },
  { id: "inbox", x: 1, y: 1, w: 1, h: 1 },
  { id: "slack-lists", x: 0, y: 2, w: 2, h: 1 },
  { id: "workspace-users", x: 0, y: 3, w: 2, h: 1 },
];

type GridLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function parseDashboardGridSize(value: string | null): number {
  return parseDashboardGridLayout(value).cols;
}

export function parseDashboardGridLayout(value: string | null): DashboardGridLayout {
  if (!value) {
    return defaultDashboardGridLayout;
  }

  const [colsValue, rowsValue = colsValue] = value.toLowerCase().split("x");
  const cols = Number(colsValue);
  const rows = Number(rowsValue);

  return isDashboardGridSize(cols) && isDashboardGridSize(rows) ? { cols, rows } : defaultDashboardGridLayout;
}

export function serializeDashboardGridLayout(layout: DashboardGridLayout): string {
  return `${layout.cols}x${layout.rows}`;
}

export function parseDashboardWidgetLayout(value: string | null): DashboardWidgetLayout[] {
  if (!value) {
    return cloneDashboardWidgetLayout(defaultDashboardWidgetLayout);
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return cloneDashboardWidgetLayout(defaultDashboardWidgetLayout);
    }

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

      const defaultWidget = getDefaultDashboardWidget(id);
      seenIds.add(id);
      layout.push({
        id,
        x: getSafeGridNumber(x, defaultWidget.x),
        y: getSafeGridNumber(y, defaultWidget.y),
        w: getSafeGridSize(w ?? colSpan, defaultWidget.w),
        h: getSafeGridSize(h ?? rowSpan, defaultWidget.h),
      });
    }

    for (const widget of defaultDashboardWidgetLayout) {
      if (!seenIds.has(widget.id)) {
        layout.push({ ...widget });
      }
    }

    return layout.length > 0 ? layout : cloneDashboardWidgetLayout(defaultDashboardWidgetLayout);
  } catch {
    return cloneDashboardWidgetLayout(defaultDashboardWidgetLayout);
  }
}

export function normalizeDashboardWidgetLayout(layout: ReadonlyArray<GridLayoutItem>, gridSize: number): DashboardWidgetLayout[] {
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

  for (const widget of defaultDashboardWidgetLayout) {
    if (!seenIds.has(widget.id)) {
      normalized.push({ ...widget });
    }
  }

  return normalized;
}

export function getDashboardOccupiedCellCount(layout: DashboardWidgetLayout[], gridSize: number): number {
  return layout.reduce((total, widget) => total + Math.min(widget.w, gridSize) * Math.min(widget.h, gridSize), 0);
}

export function serializeDashboardWidgetLayout(layout: DashboardWidgetLayout[]): string {
  return JSON.stringify(layout);
}

function cloneDashboardWidgetLayout(layout: DashboardWidgetLayout[]): DashboardWidgetLayout[] {
  return layout.map((widget) => ({ ...widget }));
}

function getDefaultDashboardWidget(id: DashboardWidgetId) {
  return defaultDashboardWidgetLayout.find((widget) => widget.id === id) ?? defaultDashboardWidgetLayout[0];
}

function getSafeGridNumber(value: unknown, fallback: number) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

function getSafeGridSize(value: unknown, fallback: number) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) : fallback;
}

function isDashboardGridSize(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= dashboardGridMaxSize;
}

function clampGridNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max);
}

export function isDashboardWidgetId(id: unknown): id is DashboardWidgetId {
  return dashboardWidgetIds.includes(id as DashboardWidgetId);
}
