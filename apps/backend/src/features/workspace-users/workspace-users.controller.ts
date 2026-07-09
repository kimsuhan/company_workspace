import type { Hono } from "hono";

import { getWorkspaceUserSaveErrorMessage, readRouteId } from "./workspace-users.helper.js";
import {
  createWorkspaceUser,
  deleteWorkspaceUser,
  listWorkspaceUsers,
  listWorkspaceUserStatuses,
  updateWorkspaceUser,
} from "./workspace-users.service.js";

export function registerWorkspaceUserRoutes(app: Hono): void {
  app.get("/api/workspace-users", async (c) => c.json(await listWorkspaceUsers()));
  app.get("/api/workspace-users/status", async (c) => c.json(await listWorkspaceUserStatuses()));

  app.post("/api/workspace-users", async (c) => {
    try {
      return c.json(await createWorkspaceUser(await c.req.json().catch(() => ({}))), 201);
    } catch (error) {
      return c.json({ error: getWorkspaceUserSaveErrorMessage(error) }, 400);
    }
  });

  app.patch("/api/workspace-users/:id", async (c) => {
    const id = readRouteId(c.req.param("id"));

    if (id === null) {
      return c.json({ error: "Invalid workspace user id" }, 400);
    }

    try {
      const user = await updateWorkspaceUser(id, await c.req.json().catch(() => ({})));
      return user ? c.json(user) : c.json({ error: "Workspace user not found" }, 404);
    } catch (error) {
      return c.json({ error: getWorkspaceUserSaveErrorMessage(error) }, 400);
    }
  });

  app.delete("/api/workspace-users/:id", async (c) => {
    const id = readRouteId(c.req.param("id"));

    if (id === null) {
      return c.json({ error: "Invalid workspace user id" }, 400);
    }

    return (await deleteWorkspaceUser(id)) ? c.json({ ok: true }) : c.json({ error: "Workspace user not found" }, 404);
  });
}
