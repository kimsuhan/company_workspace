import type { Hono } from "hono";

import {
  createSlackListItemEventStream,
  createSlackListSource,
  deleteSlackListSource,
  getSlackListItemResponse,
  getSlackSettings,
  listSlackListItems,
  listSlackListSources,
  previewSlackListFields,
  readRouteId,
  saveSlackToken,
  syncSlackListSourceAndBroadcast,
  testSlackListSource,
  testSlackSettings,
  updateSlackListItemCellValues,
  updateSlackListSource,
} from "./slack-lists.service.js";

export function registerSlackListRoutes(app: Hono): void {
  app.get("/slack/settings", async (c) => c.json(await getSlackSettings()));

  app.put("/slack/settings", async (c) => c.json(await saveSlackToken(await c.req.json().catch(() => ({})))));

  app.post("/slack/settings/test", async (c) => {
    const result = await testSlackSettings();
    return "error" in result ? c.json(result, 400) : c.json(result);
  });

  app.get("/slack/lists/sources", async (c) => c.json(await listSlackListSources()));

  app.post("/slack/lists/fields/preview", async (c) => {
    const result = await previewSlackListFields(await c.req.json().catch(() => ({})));
    return "error" in result ? c.json(result, 400) : c.json(result);
  });

  app.post("/slack/lists/sources", async (c) => c.json(await createSlackListSource(await c.req.json().catch(() => ({})))));

  app.patch("/slack/lists/sources/:id", async (c) => {
    const source = await updateSlackListSource(Number(c.req.param("id")), await c.req.json().catch(() => ({})));
    return source ? c.json(source) : c.json({ error: "Slack list source not found" }, 404);
  });

  app.delete("/slack/lists/sources/:id", async (c) => {
    await deleteSlackListSource(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  app.post("/slack/lists/sources/:id/test", async (c) => {
    const result = await testSlackListSource(Number(c.req.param("id")));
    return "error" in result ? c.json({ error: result.error }, result.status) : c.json(result);
  });

  app.post("/slack/lists/sources/:id/sync", async (c) => c.json(await syncSlackListSourceAndBroadcast(Number(c.req.param("id")))));

  app.get("/slack/lists/items", async (c) => c.json(await listSlackListItems()));

  app.get("/slack/lists/items/events", () => {
    return new Response(createSlackListItemEventStream(), {
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

    const item = await getSlackListItemResponse(itemId);
    return item ? c.json(item) : c.json({ error: "Slack list item not found" }, 404);
  });

  app.patch("/slack/lists/items/:id/cells", async (c) => {
    const itemId = readRouteId(c.req.param("id"));

    if (itemId === null) {
      return c.json({ error: "Invalid Slack list item id" }, 400);
    }

    const item = await updateSlackListItemCellValues(itemId, await c.req.json().catch(() => ({})));

    if (!item) {
      return c.json({ error: "Slack list item not found" }, 404);
    }

    return "error" in item ? c.json(item, 400) : c.json(item);
  });
}
