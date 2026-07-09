import type { Hono } from "hono";

import { getErrorMessage, readId, readProjectHealthTestInput } from "./projects.helper.js";
import {
  checkProjectHealth,
  createProject,
  createProjectEventStream,
  createProjectNode,
  deleteProject,
  deleteProjectNode,
  listProjects,
  listProjectTree,
  moveProjectNode,
  updateProject,
  updateProjectNode,
} from "./projects.service.js";

export function registerProjectRoutes(app: Hono): void {
  app.get("/api/projects", async (c) => c.json(await listProjects()));
  app.get("/api/projects/events", () => {
    return new Response(createProjectEventStream(), {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
  app.post("/api/projects/health/test", async (c) => {
    try {
      return c.json(await checkProjectHealth(readProjectHealthTestInput(await c.req.json())));
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.post("/api/projects", async (c) => {
    try {
      return c.json(await createProject(await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/projects/:id", async (c) => {
    try {
      const project = await updateProject(readId(c.req.param("id"), "project id"), await c.req.json());
      return project ? c.json(project) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/api/projects/:id", async (c) => {
    try {
      const deleted = await deleteProject(readId(c.req.param("id"), "project id"));
      return deleted ? c.json({ ok: true }) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.get("/api/projects/:id/tree", async (c) => {
    try {
      const tree = await listProjectTree(readId(c.req.param("id"), "project id"));
      return tree ? c.json(tree) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.post("/api/projects/:id/nodes", async (c) => {
    try {
      const node = await createProjectNode(readId(c.req.param("id"), "project id"), await c.req.json());
      return node ? c.json(node, 201) : c.json({ error: "Project not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/projects/:id/nodes/:nodeId", async (c) => {
    try {
      const node = await updateProjectNode(
        readId(c.req.param("id"), "project id"),
        readId(c.req.param("nodeId"), "node id"),
        await c.req.json(),
      );
      return node ? c.json(node) : c.json({ error: "Node not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/projects/:id/nodes/:nodeId/move", async (c) => {
    try {
      const node = await moveProjectNode(
        readId(c.req.param("id"), "project id"),
        readId(c.req.param("nodeId"), "node id"),
        await c.req.json(),
      );
      return node ? c.json(node) : c.json({ error: "Node not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/api/projects/:id/nodes/:nodeId", async (c) => {
    try {
      const deleted = await deleteProjectNode(readId(c.req.param("id"), "project id"), readId(c.req.param("nodeId"), "node id"));
      return deleted ? c.json({ ok: true }) : c.json({ error: "Node not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}
