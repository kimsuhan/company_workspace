import type { Hono } from "hono";

import { getErrorMessage, readId } from "./todos.helper.js";
import {
  createTodoComment,
  createTodoEventStream,
  createTodoMemo,
  deleteTodoComment,
  deleteTodoMemo,
  listTodoMemos,
  updateTodoComment,
  updateTodoMemo,
} from "./todos.service.js";

export function registerTodoRoutes(app: Hono): void {
  app.get("/todos", async (c) => c.json(await listTodoMemos()));
  app.get("/todos/events", () => {
    return new Response(createTodoEventStream(), {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
  app.post("/todos", async (c) => {
    try {
      return c.json(await createTodoMemo(await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/todos/:id", async (c) => {
    try {
      const memo = await updateTodoMemo(readId(c.req.param("id")), await c.req.json());
      return memo ? c.json(memo) : c.json({ error: "Todo not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/todos/:id", async (c) => {
    try {
      await deleteTodoMemo(readId(c.req.param("id")));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.post("/todos/:id/comments", async (c) => {
    try {
      return c.json(await createTodoComment(readId(c.req.param("id")), await c.req.json()), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/todos/:id/comments/:commentId", async (c) => {
    try {
      const comment = await updateTodoComment(readId(c.req.param("id")), readId(c.req.param("commentId")), await c.req.json());
      return comment ? c.json(comment) : c.json({ error: "Comment not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/todos/:id/comments/:commentId", async (c) => {
    try {
      await deleteTodoComment(readId(c.req.param("id")), readId(c.req.param("commentId")));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}
