import type { Hono } from "hono";

import { getErrorMessage, readId, readNoteInput, readNoteKind, readNotePatchInput } from "./notes.helper.js";
import { createNote, createNoteEventStream, deleteNote, listNotes, updateNote } from "./notes.service.js";

export function registerNoteRoutes(app: Hono): void {
  app.get("/api/notes", async (c) => {
    try {
      const kindParam = c.req.query("kind");
      return c.json(await listNotes(kindParam ? readNoteKind(kindParam) : undefined));
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.get("/api/notes/events", () => {
    return new Response(createNoteEventStream(), {
      headers: {
        "cache-control": "no-cache",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
  app.post("/api/notes", async (c) => {
    try {
      return c.json(await createNote(readNoteInput(await c.req.json())), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.patch("/api/notes/:id", async (c) => {
    try {
      const note = await updateNote(readId(c.req.param("id")), readNotePatchInput(await c.req.json()));
      return note ? c.json(note) : c.json({ error: "Note not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.delete("/api/notes/:id", async (c) => {
    try {
      await deleteNote(readId(c.req.param("id")));
      return c.json({ ok: true });
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}
