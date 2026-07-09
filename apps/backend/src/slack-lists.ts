import type { Hono } from "hono";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import cron from "node-cron";

import { getDb } from "./db.js";
import { slackListItems, slackListSources, slackSettings, workspaceUsers } from "./schema.js";

const SLACK_API_URL = "https://slack.com/api";
const SSE_HEARTBEAT_MS = 25_000;
const DEFAULT_SYNC_CRON = "*/5 * * * *";

export type SlackListFieldMapping = {
  columnId?: string;
  key?: string;
  type?: string;
  label?: string;
  sampleValue?: string;
  optionLabels?: Record<string, string>;
  dashboardValues?: string[];
  inProgressValues?: string[];
  doneValues?: string[];
  display?: boolean;
  writable?: boolean;
  role?: SlackListFieldRole;
};

export type SlackMappedField = {
  label: string;
  value: unknown;
  type: string;
  display: boolean;
  writable: boolean;
  columnId: string | null;
  dashboardValues?: string[];
  role?: SlackListFieldRole;
  userIds?: string[];
};

export type SlackListFieldRole = "assignee" | "status" | "title" | "done" | "none";

type WorkspaceUserSummary = {
  id: number;
  name: string;
  slackUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type SlackListFilterCondition = {
  field: string;
  op: "eq" | "in" | "contains" | "exists";
  value?: unknown;
};

type SlackListFilter = {
  all?: SlackListFilterCondition[];
};

type SlackListItemField = {
  key?: string;
  value?: unknown;
  column_id?: string;
  text?: string;
  select?: string[];
  user?: string[];
  channel?: string[];
  date?: string[];
  number?: number[];
  checkbox?: boolean[];
  email?: string[];
  phone?: string[];
  rating?: number[];
  attachment?: string[];
  message?: { value?: string; channel_id?: string; ts?: string; thread_ts?: string }[];
  link?: { originalUrl?: string; displayName?: string }[];
};

type SlackListItem = {
  id: string;
  list_id: string;
  date_created?: number;
  updated_timestamp?: string;
  fields?: SlackListItemField[];
  archived?: boolean;
};

type SlackListSchemaColumn = {
  id?: string;
  name?: string;
  key?: string;
  type?: string;
  options?: {
    choices?: { value?: string; label?: string }[];
  };
};

type SlackListItemsResponse = {
  ok: boolean;
  items?: SlackListItem[];
  response_metadata?: { next_cursor?: string };
  error?: string;
};

type SlackListItemInfoResponse = {
  ok: boolean;
  list?: {
    list_metadata?: {
      schema?: SlackListSchemaColumn[];
    };
  };
  error?: string;
};

type SlackListDownloadStartResponse = {
  ok: boolean;
  job_id?: string;
  error?: string;
};

type SlackListDownloadGetResponse = {
  ok: boolean;
  status?: string;
  download_url?: string;
  error?: string;
};

type SlackListItemUpdateResponse = {
  ok: boolean;
  error?: string;
};

type SlackListFieldPreview = {
  key: string;
  label: string;
  columnId: string;
  type: string;
  sampleValue: string;
  optionLabels?: Record<string, string>;
  display: boolean;
  writable: boolean;
};

type SlackListSourceRow = typeof slackListSources.$inferSelect;
type SlackListItemRow = typeof slackListItems.$inferSelect;
type WorkspaceUserRow = typeof workspaceUsers.$inferSelect;

type SlackListSourceInput = {
  name?: unknown;
  listId?: unknown;
  fieldMapping?: unknown;
  fieldMappings?: unknown;
  filterConfig?: unknown;
  filterRules?: unknown;
  isActive?: unknown;
};

type SlackListItemResponse = ReturnType<typeof mapSlackListItemRow>;

const sseClients = new Set<ReadableStreamDefaultController<string>>();

class SlackRateLimitError extends Error {
  constructor(readonly backoffUntil: Date | undefined) {
    super(`Slack API rate limited until ${backoffUntil?.toISOString() ?? "later"}`);
  }
}

export function maskSlackToken(token: string | null): string | null {
  if (!token) {
    return null;
  }

  return token.length <= 8 ? "****" : `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function getSlackBackoffUntil(headers: Headers, now = Date.now()): Date | undefined {
  const retryAfter = Number(headers.get("retry-after"));

  return Number.isFinite(retryAfter) && retryAfter > 0 ? new Date(now + retryAfter * 1000) : undefined;
}

export function parseSlackListId(value: string): string {
  const input = value.trim();

  if (/^F[A-Z0-9]+$/i.test(input)) {
    return input;
  }

  try {
    const url = new URL(input);
    const queryListId = url.searchParams.get("list_id");

    if (queryListId && /^F[A-Z0-9]+$/i.test(queryListId)) {
      return queryListId;
    }

    const pathListId = url.pathname.split("/").filter(Boolean).at(-1);

    if (pathListId && /^F[A-Z0-9]+$/i.test(pathListId)) {
      return pathListId;
    }
  } catch {
    // Not a URL. Fall through to the explicit validation error below.
  }

  throw new Error("listId must be a Slack List ID or Slack List URL");
}

export function mapSlackItemToMappedFields(
  item: SlackListItem,
  mapping: Record<string, SlackListFieldMapping>,
): Record<string, SlackMappedField> {
  const fields = item.fields ?? [];
  const byColumnId = new Map(fields.flatMap((field) => (field.column_id ? [[field.column_id, field]] : [])));
  const byKey = new Map(fields.flatMap((field) => (field.key ? [[field.key, field]] : [])));
  const mapped: Record<string, SlackMappedField> = {};

  for (const [name, config] of Object.entries(mapping)) {
    const field = (config.columnId ? byColumnId.get(config.columnId) : undefined) ?? (config.key ? byKey.get(config.key) : undefined);
    const role = normalizeSlackFieldRole(config.role);
    const userIds = field ? readSlackUserIds(field) : [];
    mapped[name] = {
      label: config.label?.trim() || name,
      value: field ? mapSlackDisplayValue(readSlackFieldValue(field), config) : null,
      type: config.type?.trim() || "text",
      display: config.display !== false,
      writable: config.writable === true,
      columnId: config.columnId ?? field?.column_id ?? null,
      ...(config.dashboardValues && config.dashboardValues.length > 0 ? { dashboardValues: config.dashboardValues } : {}),
      ...(role === "none" ? {} : { role }),
      ...(userIds.length > 0 ? { userIds } : {}),
    };
  }

  return mapped;
}

export function applySlackDashboardValuesToMappedFields(
  fields: Record<string, SlackMappedField>,
  mapping: Record<string, SlackListFieldMapping>,
): Record<string, SlackMappedField> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => {
      const dashboardValues = mapping[key]?.dashboardValues;
      return [key, dashboardValues && dashboardValues.length > 0 ? { ...field, dashboardValues } : field];
    }),
  );
}

export function matchesSlackListFilter(fields: Record<string, { value: unknown }>, filter: SlackListFilter): boolean {
  const conditions = Array.isArray(filter.all) ? filter.all : [];

  return conditions.every((condition) => {
    const value = fields[condition.field]?.value;

    if (condition.op === "exists") {
      return value !== null && value !== undefined && value !== "";
    }

    if (condition.op === "eq") {
      return Array.isArray(value) ? value.includes(condition.value) : value === condition.value;
    }

    if (condition.op === "in") {
      const allowed = Array.isArray(condition.value) ? condition.value : [condition.value];
      return Array.isArray(value) ? value.some((item) => allowed.includes(item)) : allowed.includes(value);
    }

    if (condition.op === "contains") {
      return Array.isArray(value)
        ? value.some((item) => String(item).includes(String(condition.value ?? "")))
        : String(value ?? "").includes(String(condition.value ?? ""));
    }

    return false;
  });
}

export function buildSlackUpdateCells(
  mapping: Record<string, SlackListFieldMapping>,
  rowId: string,
  values: Record<string, unknown>,
): Record<string, unknown>[] {
  return Object.entries(values).map(([fieldName, value]) => {
    const config = mapping[fieldName];

    if (!config?.writable) {
      throw new Error(`${fieldName} is not writable`);
    }

    if (!config.columnId) {
      throw new Error(`${fieldName} columnId is required`);
    }

    return {
      row_id: rowId,
      column_id: config.columnId,
      ...toSlackCellValue(config.type ?? "text", mapSlackWriteValue(value, config)),
    };
  });
}

export function inferSlackListFieldPreviews(items: SlackListItem[]): SlackListFieldPreview[] {
  const seen = new Set<string>();
  const previews: SlackListFieldPreview[] = [];

  for (const item of items) {
    for (const field of item.fields ?? []) {
      const columnId = field.column_id?.trim();
      const rawKey = field.key?.trim() || columnId;

      if (!columnId || !rawKey || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      const fallbackIndex = previews.length + 1;
      const readableName = getReadablePreviewName(rawKey, fallbackIndex);
      previews.push({
        key: normalizePreviewKey(readableName),
        label: readableName,
        columnId,
        type: inferSlackFieldType(field),
        sampleValue: formatPreviewSampleValue(readSlackFieldValue(field)),
        display: true,
        writable: false,
      });
    }
  }

  return previews;
}

export function applyCsvHeadersToFieldPreviews(previews: SlackListFieldPreview[], headers: string[]): SlackListFieldPreview[] {
  return previews.map((preview, index) => {
    const label = headers[index]?.trim();

    return label
      ? {
          ...preview,
          key: normalizePreviewKey(label),
          label,
        }
      : preview;
  });
}

export function applySlackListSchemaToFieldPreviews(previews: SlackListFieldPreview[], schema: SlackListSchemaColumn[]): SlackListFieldPreview[] {
  const previewByColumnId = new Map(previews.map((preview) => [preview.columnId, preview]));

  return schema.flatMap((column, index): SlackListFieldPreview[] => {
    const columnId = column.id?.trim();

    if (!columnId) {
      return [];
    }

    const preview = previewByColumnId.get(columnId);
    const optionLabels = getSchemaOptionLabels(column);
    const label = column.name?.trim() || getReadablePreviewName(column.key?.trim() || columnId, index + 1);

    return [
      {
        key: normalizePreviewKey(column.key?.trim() || label),
        label,
        columnId,
        type: normalizeSlackSchemaType(column.type?.trim() || preview?.type || "text"),
        sampleValue: getSchemaPreviewSampleValue(preview?.sampleValue ?? "", column),
        ...(optionLabels ? { optionLabels } : {}),
        display: preview?.display ?? true,
        writable: preview?.writable ?? false,
      },
    ];
  });
}

export function parseCsvHeaderRow(csv: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === ",") {
      cells.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      break;
    }

    cell += char;
  }

  cells.push(cell);
  return cells.map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim()).filter(Boolean);
}

function getReadablePreviewName(value: string, index: number): string {
  if (/^col[a-z0-9]+$/i.test(value)) {
    return `컬럼 ${index}`;
  }

  if (value === "name") {
    return "제목";
  }

  if (value === "todo_completed") {
    return "완료 여부";
  }

  if (value === "todo_due_date") {
    return "마감 기한";
  }

  return value;
}

export function readSlackListSourceInput(input: SlackListSourceInput, current?: SlackListSourceRow): typeof slackListSources.$inferInsert {
  const name = input.name === undefined ? current?.name : readRequiredString(input.name, "name");
  const listId = input.listId === undefined ? current?.listId : parseSlackListId(readRequiredString(input.listId, "listId"));

  if (!name || !listId) {
    throw new Error("name and listId are required");
  }

  return {
    name,
    listId,
    fieldMapping:
      input.fieldMappings !== undefined
        ? readMappingRows(input.fieldMappings)
        : input.fieldMapping === undefined
          ? normalizeJsonObject(current?.fieldMapping ?? {})
          : readMappingConfig(input.fieldMapping),
    filterConfig:
      input.filterRules !== undefined
        ? readFilterRows(input.filterRules)
        : input.filterConfig === undefined
          ? normalizeJsonObject(current?.filterConfig ?? { all: [] })
          : readFilterConfig(input.filterConfig),
    isActive: typeof input.isActive === "boolean" ? input.isActive : current?.isActive ?? true,
    updatedAt: new Date(),
  };
}

export async function listSlackListItems(): Promise<SlackListItemResponse[]> {
  const rows = await getDb()
    .select()
    .from(slackListItems)
    .where(eq(slackListItems.isActive, true))
    .orderBy(desc(slackListItems.lastSeenAt));

  return mapSlackListItemRows(rows);
}

export async function syncSlackListSource(sourceId: number): Promise<SlackListItemResponse[]> {
  const token = await getStoredSlackToken();

  if (!token) {
    throw new Error("Slack token is required");
  }

  const source = await getActiveSlackListSource(sourceId);

  if (!source) {
    throw new Error("Slack list source not found");
  }

  const items = await fetchSlackListItems(token, source);
  return saveSlackListItems(await enrichSourceWithSelectOptions(token, source, items), items);
}

export async function syncSlackListSources(): Promise<void> {
  const token = await getStoredSlackToken();

  if (!token) {
    return;
  }

  const sources = await getDb()
    .select()
    .from(slackListSources)
    .where(eq(slackListSources.isActive, true));

  for (const source of sources) {
    if (source.syncBackoffUntil && source.syncBackoffUntil.getTime() > Date.now()) {
      continue;
    }

    try {
      const items = await fetchSlackListItems(token, source);
      await saveSlackListItems(await enrichSourceWithSelectOptions(token, source, items), items);
      await getDb()
        .update(slackListSources)
        .set({ lastSyncAt: new Date(), lastError: null, syncBackoffUntil: null, updatedAt: new Date() })
        .where(eq(slackListSources.id, source.id));
    } catch (error) {
      await getDb()
        .update(slackListSources)
        .set({
          lastError: error instanceof Error ? error.message : "Slack sync failed",
          syncBackoffUntil: error instanceof SlackRateLimitError ? error.backoffUntil ?? null : null,
          updatedAt: new Date(),
        })
        .where(eq(slackListSources.id, source.id));
      console.error(error);
    }
  }

  broadcastSlackListItems(await listSlackListItems());
}

export function startSlackListPolling(): () => void {
  const task = cron.schedule(DEFAULT_SYNC_CRON, () => {
    syncSlackListSources().catch((error: unknown) => {
      console.error(error);
    });
  });

  syncSlackListSources().catch((error: unknown) => {
    console.error(error);
  });

  return () => task.stop();
}

export function registerSlackListRoutes(app: Hono): void {
  app.get("/slack/settings", async (c) => {
    const token = await getStoredSlackToken();
    return c.json({ hasToken: !!token, tokenPreview: maskSlackToken(token) });
  });

  app.put("/slack/settings", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
    const token = readRequiredString(body.token, "token");
    const now = new Date();
    await getDb()
      .insert(slackSettings)
      .values({ id: 1, botToken: token, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: slackSettings.id, set: { botToken: token, updatedAt: now } });

    return c.json({ hasToken: true, tokenPreview: maskSlackToken(token) });
  });

  app.post("/slack/settings/test", async (c) => {
    const token = await getStoredSlackToken();

    if (!token) {
      return c.json({ error: "Slack token is required" }, 400);
    }

    const result = await callSlackApi<{ ok: boolean; team?: string; user?: string; url?: string; error?: string }>("auth.test", token, {});
    return c.json({ ok: true, team: result.team ?? null, user: result.user ?? null, url: result.url ?? null });
  });

  app.get("/slack/lists/sources", async (c) => {
    const rows = await getDb()
      .select()
      .from(slackListSources)
      .where(eq(slackListSources.isActive, true))
      .orderBy(desc(slackListSources.updatedAt));
    return c.json(rows.map(mapSlackListSourceRow));
  });

  app.post("/slack/lists/fields/preview", async (c) => {
    const token = await getStoredSlackToken();

    if (!token) {
      return c.json({ error: "Slack token is required" }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as { listId?: unknown };
    const listId = parseSlackListId(readRequiredString(body.listId, "listId"));
    const items = await fetchSlackListItemsById(token, listId, 20).catch((error: unknown): SlackListItem[] | { error: string } => {
      if (error instanceof Error && error.message === "list_not_found") {
        return { error: "Slack List를 찾지 못했습니다. List ID, 토큰 workspace, 앱의 List 접근 권한을 확인하세요." };
      }

      throw error;
    });

    if (!Array.isArray(items)) {
      return c.json(items, 400);
    }

    const itemFields = inferSlackListFieldPreviews(items);
    const schema = await fetchSlackListSchema(token, listId, items).catch(() => []);
    const headers = schema.length > 0 ? [] : await fetchSlackListCsvHeaders(token, listId).catch(() => []);
    const fields =
      schema.length > 0
        ? applySlackListSchemaToFieldPreviews(itemFields, schema)
        : headers.length > 0
          ? applyCsvHeadersToFieldPreviews(itemFields, headers)
          : itemFields;

    return c.json({
      listId,
      fields,
      labelSource: schema.length > 0 ? "schema" : headers.length > 0 ? "csv" : "items",
    });
  });

  app.post("/slack/lists/sources", async (c) => {
    const input = readSlackListSourceInput((await c.req.json().catch(() => ({}))) as SlackListSourceInput);
    const [row] = await getDb().insert(slackListSources).values(input).returning();
    return c.json(mapSlackListSourceRow(row));
  });

  app.patch("/slack/lists/sources/:id", async (c) => {
    const source = await getActiveSlackListSource(Number(c.req.param("id")));

    if (!source) {
      return c.json({ error: "Slack list source not found" }, 404);
    }

    const input = readSlackListSourceInput((await c.req.json().catch(() => ({}))) as SlackListSourceInput, source);
    const [row] = await getDb().update(slackListSources).set(input).where(eq(slackListSources.id, source.id)).returning();
    return c.json(mapSlackListSourceRow(row));
  });

  app.delete("/slack/lists/sources/:id", async (c) => {
    await getDb()
      .update(slackListSources)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(slackListSources.id, Number(c.req.param("id"))));
    await broadcastSlackListItems(await listSlackListItems());
    return c.json({ ok: true });
  });

  app.post("/slack/lists/sources/:id/test", async (c) => {
    const token = await getStoredSlackToken();
    const source = await getActiveSlackListSource(Number(c.req.param("id")));

    if (!token) {
      return c.json({ error: "Slack token is required" }, 400);
    }

    if (!source) {
      return c.json({ error: "Slack list source not found" }, 404);
    }

    const items = await fetchSlackListItems(token, source, 10);
    return c.json({ count: items.length, items: items.slice(0, 10).map((item) => mapSlackItemForSource(source, item)) });
  });

  app.post("/slack/lists/sources/:id/sync", async (c) => {
    const items = await syncSlackListSource(Number(c.req.param("id")));
    await broadcastSlackListItems(await listSlackListItems());
    return c.json(items);
  });
  app.get("/slack/lists/items", async (c) => c.json(await listSlackListItems()));
  app.get("/slack/lists/items/events", async () => {
    let client: ReadableStreamDefaultController<string> | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    const stream = new ReadableStream<string>({
      async start(controller) {
        client = controller;
        sseClients.add(controller);
        controller.enqueue("retry: 5000\n\n");
        controller.enqueue(`data: ${JSON.stringify(await listSlackListItems())}\n\n`);
        heartbeat = setInterval(() => {
          controller.enqueue(": ping\n\n");
        }, SSE_HEARTBEAT_MS);
      },
      cancel() {
        if (client) {
          sseClients.delete(client);
        }

        if (heartbeat) {
          clearInterval(heartbeat);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
  app.get("/slack/lists/items/:id", async (c) => {
    const itemId = readRouteId(c.req.param("id"));

    if (itemId === null) {
      return c.json({ error: "Invalid Slack list item id" }, 400);
    }

    const item = await getSlackListItem(itemId);

    if (!item) {
      return c.json({ error: "Slack list item not found" }, 404);
    }

    const [mappedItem] = await mapSlackListItemRows([item]);
    return c.json(mappedItem);
  });
  app.patch("/slack/lists/items/:id/cells", async (c) => {
    const itemId = readRouteId(c.req.param("id"));

    if (itemId === null) {
      return c.json({ error: "Invalid Slack list item id" }, 400);
    }

    const item = await getSlackListItem(itemId);

    if (!item) {
      return c.json({ error: "Slack list item not found" }, 404);
    }

    const source = await getActiveSlackListSource(item.sourceId);
    const token = await getStoredSlackToken();

    if (!source || !token) {
      return c.json({ error: "Slack source or token missing" }, 400);
    }

    const body = (await c.req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
    const values = body.values && typeof body.values === "object" ? body.values : {};
    await updateSlackListItemCells(token, source, item.slackItemId, values);

    const mappedFields = { ...(item.mappedFields as Record<string, SlackMappedField>) };
    for (const [field, value] of Object.entries(values)) {
      if (mappedFields[field]) {
        mappedFields[field] = { ...mappedFields[field], value };
      }
    }

    const [updated] = await getDb()
      .update(slackListItems)
      .set({ mappedFields, title: getMappedTitle(mappedFields, readMappingConfig(source.fieldMapping)), lastSeenAt: new Date() })
      .where(eq(slackListItems.id, item.id))
      .returning();
    await broadcastSlackListItems(await listSlackListItems());
    const [mappedItem] = await mapSlackListItemRows([updated]);
    return c.json(mappedItem);
  });
}

async function getStoredSlackToken(): Promise<string | null> {
  const [row] = await getDb().select().from(slackSettings).where(eq(slackSettings.id, 1));
  return row?.botToken ?? null;
}

async function getActiveSlackListSource(id: number): Promise<SlackListSourceRow | undefined> {
  const [row] = await getDb()
    .select()
    .from(slackListSources)
    .where(and(eq(slackListSources.id, id), eq(slackListSources.isActive, true)));
  return row;
}

async function getSlackListItem(id: number): Promise<SlackListItemRow | undefined> {
  const [row] = await getDb().select().from(slackListItems).where(eq(slackListItems.id, id));
  return row;
}

async function fetchSlackListItems(token: string, source: SlackListSourceRow, firstPageLimit = 100): Promise<SlackListItem[]> {
  return fetchSlackListItemsById(token, source.listId, firstPageLimit);
}

async function fetchSlackListItemsById(token: string, listId: string, firstPageLimit = 100): Promise<SlackListItem[]> {
  const items: SlackListItem[] = [];
  let cursor = "";

  do {
    const response = await callSlackApi<SlackListItemsResponse>("slackLists.items.list", token, {
      list_id: listId,
      limit: firstPageLimit,
      cursor: cursor || undefined,
      archived: false,
    });
    items.push(...(response.items ?? []));
    cursor = response.response_metadata?.next_cursor ?? "";
  } while (cursor && firstPageLimit === 100);

  return items;
}

async function fetchSlackListSchema(token: string, listId: string, items: SlackListItem[]): Promise<SlackListSchemaColumn[]> {
  const firstItemId = items[0]?.id;

  if (!firstItemId) {
    return [];
  }

  const result = await callSlackApi<SlackListItemInfoResponse>("slackLists.items.info", token, {
    list_id: listId,
    id: firstItemId,
  });

  return result.list?.list_metadata?.schema ?? [];
}

async function enrichSourceWithSelectOptions(
  token: string,
  source: SlackListSourceRow,
  items: SlackListItem[],
): Promise<SlackListSourceRow> {
  const mapping = readMappingConfig(source.fieldMapping);

  if (!needsSelectOptionLabels(mapping)) {
    return source;
  }

  const schema = await fetchSlackListSchema(token, source.listId, items).catch(() => []);

  if (schema.length === 0) {
    return source;
  }

  return {
    ...source,
    fieldMapping: mergeSchemaOptionLabels(mapping, schema),
  };
}

function needsSelectOptionLabels(mapping: Record<string, SlackListFieldMapping>): boolean {
  return Object.values(mapping).some((field) => {
    const optionLabels = field.optionLabels ?? {};
    return field.type === "select" && Object.keys(optionLabels).length === 0;
  });
}

function mergeSchemaOptionLabels(
  mapping: Record<string, SlackListFieldMapping>,
  schema: SlackListSchemaColumn[],
): Record<string, SlackListFieldMapping> {
  const columnById = new Map(schema.flatMap((column) => (column.id ? [[column.id, column]] : [])));

  return Object.fromEntries(
    Object.entries(mapping).map(([key, field]) => {
      const optionLabels = field.columnId ? getSchemaOptionLabels(columnById.get(field.columnId)) : undefined;
      return [key, optionLabels ? { ...field, optionLabels } : field];
    }),
  );
}

async function fetchSlackListCsvHeaders(token: string, listId: string): Promise<string[]> {
  const started = await callSlackApi<SlackListDownloadStartResponse>("slackLists.download.start", token, { list_id: listId });

  if (!started.job_id) {
    return [];
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await callSlackApi<SlackListDownloadGetResponse>("slackLists.download.get", token, {
      list_id: listId,
      job_id: started.job_id,
    });

    if (result.status === "COMPLETED" && result.download_url) {
      return parseSlackListCsvHeader(await fetchSlackListCsv(result.download_url, token));
    }

    if (result.status === "FAILED") {
      return [];
    }

    if (attempt < 7) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  return [];
}

export function parseSlackListCsvHeader(csv: string): string[] {
  const trimmed = csv.trimStart();

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return [];
  }

  return parseCsvHeaderRow(csv);
}

async function fetchSlackListCsv(url: string, token: string): Promise<string> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

  if (response.status === 401 || response.status === 403) {
    const publicResponse = await fetch(url);

    if (publicResponse.ok) {
      return publicResponse.text();
    }
  }

  if (!response.ok) {
    throw new Error(`Slack list CSV download failed: ${response.status}`);
  }

  return response.text();
}

async function updateSlackListItemCells(
  token: string,
  source: SlackListSourceRow,
  rowId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const cells = buildSlackUpdateCells(readMappingConfig(source.fieldMapping), rowId, values);
  await callSlackApi<SlackListItemUpdateResponse>("slackLists.items.update", token, {
    list_id: source.listId,
    cells,
  });
}

async function callSlackApi<T extends { ok: boolean; error?: string }>(
  method: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${SLACK_API_URL}/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    throw new SlackRateLimitError(getSlackBackoffUntil(response.headers));
  }

  if (!response.ok) {
    throw new Error(`Slack API failed: ${response.status}`);
  }

  const data = (await response.json()) as T;

  if (!data.ok) {
    throw new Error(data.error ?? "Slack API failed");
  }

  return data;
}

async function saveSlackListItems(source: SlackListSourceRow, items: SlackListItem[]): Promise<SlackListItemResponse[]> {
  const db = getDb();
  const now = new Date();
  const mapping = readMappingConfig(source.fieldMapping);
  const filter = readFilterConfig(source.filterConfig);
  const mappedItems = items.map((item) => mapSlackItemForSource(source, item)).filter((item) => matchesSlackListFilter(item.mappedFields, filter));
  const activeIds = mappedItems.map((item) => item.slackItemId);

  for (const item of mappedItems) {
    await db
      .insert(slackListItems)
      .values({
        sourceId: source.id,
        slackItemId: item.slackItemId,
        title: item.title,
        mappedFields: item.mappedFields,
        rawItem: item.rawItem,
        isActive: true,
        firstSeenAt: now,
        lastSeenAt: now,
        slackCreatedAt: item.slackCreatedAt ? new Date(item.slackCreatedAt) : null,
        slackUpdatedAt: item.slackUpdatedAt ? new Date(item.slackUpdatedAt) : null,
      })
      .onConflictDoUpdate({
        target: [slackListItems.sourceId, slackListItems.slackItemId],
        set: {
          title: item.title,
          mappedFields: item.mappedFields,
          rawItem: item.rawItem,
          isActive: true,
          lastSeenAt: now,
          slackUpdatedAt: item.slackUpdatedAt ? new Date(item.slackUpdatedAt) : null,
        },
      });
  }

  if (activeIds.length > 0) {
    await db
      .update(slackListItems)
      .set({ isActive: false, lastSeenAt: now })
      .where(and(eq(slackListItems.sourceId, source.id), eq(slackListItems.isActive, true), notInArray(slackListItems.slackItemId, activeIds)));
  } else {
    await db
      .update(slackListItems)
      .set({ isActive: false, lastSeenAt: now })
      .where(and(eq(slackListItems.sourceId, source.id), eq(slackListItems.isActive, true)));
  }

  await db
    .update(slackListSources)
    .set({ lastSyncAt: now, lastError: null, syncBackoffUntil: null, updatedAt: now })
    .where(eq(slackListSources.id, source.id));

  const rows = await db
    .select()
    .from(slackListItems)
    .where(and(eq(slackListItems.sourceId, source.id), eq(slackListItems.isActive, true)))
    .orderBy(desc(slackListItems.lastSeenAt));

  return mapSlackListItemRows(rows);
}

function mapSlackItemForSource(source: SlackListSourceRow, item: SlackListItem) {
  const mapping = readMappingConfig(source.fieldMapping);
  const mappedFields = mapSlackItemToMappedFields(item, mapping);

  return {
    sourceId: source.id,
    sourceName: source.name,
    slackItemId: item.id,
    title: getMappedTitle(mappedFields, mapping),
    mappedFields,
    rawItem: item as unknown as Record<string, unknown>,
    slackCreatedAt: item.date_created ? new Date(item.date_created * 1000).toISOString() : null,
    slackUpdatedAt: item.updated_timestamp ? new Date(Number(item.updated_timestamp) * 1000).toISOString() : null,
  };
}

function mapSlackListSourceRow(row: SlackListSourceRow) {
  return {
    id: row.id,
    name: row.name,
    listId: row.listId,
    fieldMapping: row.fieldMapping,
    filterConfig: row.filterConfig,
    isActive: row.isActive,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    syncBackoffUntil: row.syncBackoffUntil?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function mapSlackListItemRows(rows: SlackListItemRow[]): Promise<SlackListItemResponse[]> {
  if (rows.length === 0) {
    return [];
  }

  const sourceIds = Array.from(new Set(rows.map((row) => row.sourceId)));
  const [sources, users] = await Promise.all([
    getDb().select().from(slackListSources).where(inArray(slackListSources.id, sourceIds)),
    getDb().select().from(workspaceUsers).where(eq(workspaceUsers.isActive, true)),
  ]);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const userBySlackId = new Map(users.flatMap((user) => (user.slackUserId ? [[user.slackUserId, user]] : [])));

  return rows.map((row) => mapSlackListItemRow(row, sourceById.get(row.sourceId), userBySlackId));
}

function mapSlackListItemRow(
  row: SlackListItemRow,
  source?: SlackListSourceRow,
  userBySlackId: Map<string, WorkspaceUserRow> = new Map(),
) {
  const storedFields = row.mappedFields as Record<string, SlackMappedField>;
  const mapping = source ? readMappingConfig(source.fieldMapping) : undefined;
  const mappedFields = mapping ? applySlackDashboardValuesToMappedFields(storedFields, mapping) : storedFields;
  const fieldRoles = getSlackFieldRoles(mappedFields, mapping);
  const assignedUsers = getAssignedSlackUserIds(mappedFields, mapping)
    .flatMap((slackUserId) => {
      const user = userBySlackId.get(slackUserId);
      return user ? [mapWorkspaceUserSummary(user)] : [];
    });
  const title = getMappedTitle(mappedFields, mapping);

  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName: source?.name ?? null,
    slackItemId: row.slackItemId,
    title: title === "Untitled" ? row.title : title,
    mappedFields,
    assignedUsers,
    fieldRoles,
    rawItem: row.rawItem,
    isActive: row.isActive,
    slackCreatedAt: row.slackCreatedAt?.toISOString() ?? null,
    slackUpdatedAt: row.slackUpdatedAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

function mapWorkspaceUserSummary(row: WorkspaceUserRow): WorkspaceUserSummary {
  return {
    id: row.id,
    name: row.name,
    slackUserId: row.slackUserId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function readSlackFieldValue(field: SlackListItemField): unknown {
  if (field.text?.trim()) {
    return field.text.trim();
  }

  for (const key of ["select", "user", "channel", "date", "number", "checkbox", "email", "phone", "rating", "attachment"] as const) {
    const value = field[key];

    if (Array.isArray(value) && value.length > 0) {
      return value.length === 1 ? value[0] : value;
    }
  }

  if (Array.isArray(field.link) && field.link.length > 0) {
    return field.link.map((link) => link.displayName || link.originalUrl).filter(Boolean);
  }

  if (Array.isArray(field.message) && field.message.length > 0) {
    return field.message.map((message) => message.value).filter(Boolean);
  }

  return field.value ?? null;
}

function readSlackUserIds(field: SlackListItemField): string[] {
  return uniqueSlackUserIds([...(field.user ?? []), ...extractSlackUserIds(field.value)]);
}

export function getSlackFieldRoles(
  fields: Record<string, SlackMappedField>,
  mapping: Record<string, SlackListFieldMapping> = {},
): Partial<Record<Exclude<SlackListFieldRole, "none">, string>> {
  const roles: Partial<Record<Exclude<SlackListFieldRole, "none">, string>> = {};

  for (const [key, field] of Object.entries(fields)) {
    const role = normalizeSlackFieldRole(field.role ?? mapping[key]?.role);

    if (role !== "none" && roles[role] === undefined) {
      roles[role] = key;
    }
  }

  for (const [key, field] of Object.entries(fields)) {
    const role = guessSlackFieldRole(key, field, mapping[key]);

    if (role !== "none" && roles[role] === undefined) {
      roles[role] = key;
    }
  }

  return roles;
}

export function getAssignedSlackUserIds(
  fields: Record<string, SlackMappedField>,
  mapping: Record<string, SlackListFieldMapping> = {},
): string[] {
  const roles = getSlackFieldRoles(fields, mapping);
  const assigneeField = roles.assignee ? fields[roles.assignee] : undefined;

  if (!assigneeField) {
    return [];
  }

  return uniqueSlackUserIds([...(assigneeField.userIds ?? []), ...extractSlackUserIds(assigneeField.value)]);
}

export function isSlackListItemDone(
  fields: Record<string, SlackMappedField>,
  mapping: Record<string, SlackListFieldMapping> = {},
): boolean {
  const roles = getSlackFieldRoles(fields, mapping);
  const statusField = roles.status ? fields[roles.status] : undefined;
  const doneValues = roles.status ? mapping[roles.status]?.doneValues ?? [] : [];

  if (statusField && doneValues.length > 0) {
    return isSlackStatusValue(statusField.value, doneValues);
  }

  const doneField = roles.done ? fields[roles.done] : undefined;

  return doneField ? isTruthySlackValue(doneField.value) : false;
}

export function isSlackListItemInProgress(
  fields: Record<string, SlackMappedField>,
  mapping: Record<string, SlackListFieldMapping> = {},
): boolean {
  const roles = getSlackFieldRoles(fields, mapping);
  const statusField = roles.status ? fields[roles.status] : undefined;
  const inProgressValues = roles.status ? mapping[roles.status]?.inProgressValues ?? [] : [];

  return !statusField || inProgressValues.length === 0 || isSlackStatusValue(statusField.value, inProgressValues);
}

function inferSlackFieldType(field: SlackListItemField): string {
  if (Array.isArray(field.select)) return "select";
  if (Array.isArray(field.user)) return "user";
  if (Array.isArray(field.date)) return "date";
  if (Array.isArray(field.checkbox)) return "checkbox";
  if (Array.isArray(field.number)) return "number";
  if (Array.isArray(field.link)) return "link";
  if (Array.isArray(field.email)) return "email";
  if (Array.isArray(field.phone)) return "phone";

  return "text";
}

function formatPreviewSampleValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(", ");
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizePreviewKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || value;
}

function normalizeSlackFieldRole(value: unknown): SlackListFieldRole {
  return value === "assignee" || value === "status" || value === "title" || value === "done" ? value : "none";
}

function guessSlackFieldRole(
  key: string,
  field: SlackMappedField,
  mapping?: SlackListFieldMapping,
): SlackListFieldRole {
  const explicitRole = normalizeSlackFieldRole(mapping?.role);

  if (explicitRole !== "none") {
    return explicitRole;
  }

  const type = (field.type || mapping?.type || "").toLowerCase();
  const label = `${key} ${field.label} ${mapping?.label ?? ""}`.toLowerCase();

  if (type === "user" && (label.includes("assignee") || label.includes("담당자") || label.includes("담당") || label.includes("owner"))) {
    return "assignee";
  }

  if ((type === "checkbox" || type === "completed") && (label.includes("done") || label.includes("complete") || label.includes("완료"))) {
    return "done";
  }

  if (label.includes("status") || label.includes("상태")) {
    return "status";
  }

  if (
    label.includes("title") ||
    label.includes("제목") ||
    label.includes("요청_사항") ||
    label.includes("요청사항") ||
    label.includes("요청 내용") ||
    label.includes("name")
  ) {
    return "title";
  }

  return "none";
}

function extractSlackUserIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(extractSlackUserIds);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim().toUpperCase();
  return /^U[A-Z0-9]+$/.test(trimmed) ? [trimmed] : [];
}

function uniqueSlackUserIds(values: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const value of values) {
    const id = value.trim().toUpperCase();

    if (/^U[A-Z0-9]+$/.test(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
}

function isTruthySlackValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(isTruthySlackValue);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes", "y", "완료", "done", "completed"].includes(value.trim().toLowerCase());
  }

  return false;
}

function isSlackStatusValue(value: unknown, values: string[]): boolean {
  const allowed = new Set(values.map((item) => item.trim()).filter(Boolean));

  if (Array.isArray(value)) {
    return value.some((item) => isSlackStatusValue(item, values));
  }

  return typeof value === "string" && allowed.has(value.trim());
}

function normalizeSlackSchemaType(type: string): string {
  if (type === "rich_text" || type === "message" || type === "canvas" || type === "created_time" || type === "last_edited_time") {
    return "text";
  }

  if (type === "multi_select") {
    return "select";
  }

  if (type === "assignee" || type === "todo_assignee" || type === "created_by") {
    return "user";
  }

  if (type === "completed" || type === "todo_completed") {
    return "checkbox";
  }

  if (type === "due_date" || type === "todo_due_date") {
    return "date";
  }

  return type || "text";
}

function getSchemaPreviewSampleValue(sampleValue: string, column: SlackListSchemaColumn): string {
  const labelByValue = getSchemaOptionLabels(column);

  if (!labelByValue || !sampleValue) {
    return sampleValue;
  }

  return sampleValue
    .split(",")
    .map((value) => {
      const trimmed = value.trim();
      return labelByValue[trimmed] ?? trimmed;
    })
    .filter(Boolean)
    .join(", ");
}

function getSchemaOptionLabels(column: SlackListSchemaColumn | undefined): Record<string, string> | undefined {
  const entries = (column?.options?.choices ?? []).flatMap((choice): [string, string][] =>
    choice.value && choice.label ? [[choice.value, choice.label]] : [],
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function mapSlackDisplayValue(value: unknown, config: SlackListFieldMapping): unknown {
  if (config.type !== "select" || !config.optionLabels) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => mapSlackDisplayValue(item, config));
  }

  return typeof value === "string" ? config.optionLabels[value] ?? value : value;
}

function mapSlackWriteValue(value: unknown, config: SlackListFieldMapping): unknown {
  if (config.type !== "select" || !config.optionLabels) {
    return value;
  }

  const valueByLabel = new Map(Object.entries(config.optionLabels).map(([optionValue, label]) => [label, optionValue]));

  if (Array.isArray(value)) {
    return value.map((item) => mapSlackWriteValue(item, config));
  }

  return typeof value === "string" ? valueByLabel.get(value) ?? value : value;
}

function toSlackCellValue(type: string, value: unknown): Record<string, unknown> {
  if (type === "select") {
    return { select: [String(value)] };
  }

  if (type === "user") {
    return { user: Array.isArray(value) ? value.map(String) : [String(value)] };
  }

  if (type === "date" || type === "due_date") {
    return { date: [String(value)] };
  }

  if (type === "checkbox" || type === "completed") {
    return { checkbox: [Boolean(value)] };
  }

  return {
    rich_text: [
      {
        type: "rich_text",
        elements: [{ type: "rich_text_section", elements: [{ type: "text", text: String(value) }] }],
      },
    ],
  };
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

function readRouteId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readOptionLabels(value: unknown): Record<string, string> | undefined {
  const object = normalizeJsonObject(value);
  const labels = Object.fromEntries(
    Object.entries(object).flatMap(([optionValue, label]): [string, string][] =>
      typeof label === "string" && optionValue.trim() && label.trim() ? [[optionValue.trim(), label.trim()]] : [],
    ),
  );

  return Object.keys(labels).length > 0 ? labels : undefined;
}

function readStringList(value: unknown): string[] | undefined {
  const values =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : [];
  const strings = values.flatMap((item): string[] => (typeof item === "string" && item.trim() ? [item.trim()] : []));

  return strings.length > 0 ? Array.from(new Set(strings)) : undefined;
}

export function readMappingConfig(value: unknown): Record<string, SlackListFieldMapping> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const object = normalizeJsonObject(parsed);
  const mapping: Record<string, SlackListFieldMapping> = {};
  const usedRoles = new Set<Exclude<SlackListFieldRole, "none">>();

  for (const [key, config] of Object.entries(object)) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      continue;
    }

    const field = config as Record<string, unknown>;
    const role = readMappingRole(field.role, usedRoles);
    const optionLabels = readOptionLabels(field.optionLabels);
    const dashboardValues = readStringList(field.dashboardValues);
    const inProgressValues = readStringList(field.inProgressValues);
    const doneValues = readStringList(field.doneValues);
    mapping[key] = {
      columnId: typeof field.columnId === "string" ? field.columnId.trim() : undefined,
      key: typeof field.key === "string" ? field.key.trim() : undefined,
      type: typeof field.type === "string" ? field.type.trim() : "text",
      label: typeof field.label === "string" ? field.label.trim() : key,
      sampleValue: typeof field.sampleValue === "string" ? field.sampleValue.trim() : undefined,
      ...(optionLabels ? { optionLabels } : {}),
      ...(dashboardValues ? { dashboardValues } : {}),
      ...(inProgressValues ? { inProgressValues } : {}),
      ...(doneValues ? { doneValues } : {}),
      display: field.display !== false,
      writable: field.writable === true,
      ...(role ? { role } : {}),
    };
  }

  return mapping;
}

function readMappingRows(value: unknown): Record<string, SlackListFieldMapping> {
  if (!Array.isArray(value)) {
    return {};
  }

  const mapping: Record<string, SlackListFieldMapping> = {};
  const usedRoles = new Set<Exclude<SlackListFieldRole, "none">>();

  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const item = row as Record<string, unknown>;
    const key = typeof item.key === "string" ? item.key.trim() : "";

    if (!key) {
      continue;
    }

    const role = readMappingRole(item.role, usedRoles);
    const optionLabels = readOptionLabels(item.optionLabels);
    const dashboardValues = readStringList(item.dashboardValues);
    const inProgressValues = readStringList(item.inProgressValues);
    const doneValues = readStringList(item.doneValues);
    mapping[key] = {
      columnId: typeof item.columnId === "string" ? item.columnId.trim() : undefined,
      type: typeof item.type === "string" && item.type.trim() ? item.type.trim() : "text",
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : key,
      sampleValue: typeof item.sampleValue === "string" ? item.sampleValue.trim() : undefined,
      ...(optionLabels ? { optionLabels } : {}),
      ...(dashboardValues ? { dashboardValues } : {}),
      ...(inProgressValues ? { inProgressValues } : {}),
      ...(doneValues ? { doneValues } : {}),
      display: item.display !== false,
      writable: item.writable === true,
      ...(role ? { role } : {}),
    };
  }

  return mapping;
}

function readMappingRole(value: unknown, usedRoles: Set<Exclude<SlackListFieldRole, "none">>): Exclude<SlackListFieldRole, "none"> | undefined {
  const role = normalizeSlackFieldRole(value);

  if (role === "none" || usedRoles.has(role)) {
    return undefined;
  }

  usedRoles.add(role);
  return role;
}

function readFilterConfig(value: unknown): SlackListFilter {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const object = normalizeJsonObject(parsed);

  if (!Array.isArray(object.all)) {
    return { all: [] };
  }

  return {
    all: object.all.flatMap((condition) => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
        return [];
      }

      const field = (condition as Record<string, unknown>).field;
      const op = (condition as Record<string, unknown>).op;

      return typeof field === "string" && (op === "eq" || op === "in" || op === "contains" || op === "exists")
        ? [{ field, op, value: (condition as Record<string, unknown>).value }]
        : [];
    }),
  };
}

function readFilterRows(value: unknown): SlackListFilter {
  if (!Array.isArray(value)) {
    return { all: [] };
  }

  return {
    all: value.flatMap((row): SlackListFilterCondition[] => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return [];
      }

      const item = row as Record<string, unknown>;
      const field = typeof item.field === "string" ? item.field.trim() : "";
      const op = item.op;

      if (!field || (op !== "eq" && op !== "in" && op !== "contains" && op !== "exists")) {
        return [];
      }

      if (op === "exists") {
        return [{ field, op }];
      }

      const rawValue = typeof item.value === "string" ? item.value.trim() : item.value;

      if (rawValue === "" || rawValue === undefined || rawValue === null) {
        return [];
      }

      return [
        {
          field,
          op,
          value: op === "in" && typeof rawValue === "string" ? rawValue.split(",").map((part) => part.trim()).filter(Boolean) : rawValue,
        },
      ];
    }),
  };
}

export function getMappedTitle(
  fields: Record<string, SlackMappedField>,
  mapping: Record<string, SlackListFieldMapping> = {},
): string {
  const roles = getSlackFieldRoles(fields, mapping);
  const title = roles.title ? fields[roles.title]?.value : fields.title?.value;

  if (title !== null && title !== undefined && String(title).trim()) {
    return String(title).trim();
  }

  const firstDisplayField = Object.values(fields).find((field) => field.display && field.value !== null && field.value !== undefined);
  return firstDisplayField ? String(firstDisplayField.value) : "Untitled";
}

async function broadcastSlackListItems(items: Awaited<ReturnType<typeof listSlackListItems>>): Promise<void> {
  const message = `data: ${JSON.stringify(items)}\n\n`;

  for (const client of sseClients) {
    try {
      client.enqueue(message);
    } catch {
      sseClients.delete(client);
    }
  }
}
