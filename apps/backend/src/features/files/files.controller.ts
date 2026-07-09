import { readFile } from "node:fs/promises";

import type { Hono } from "hono";

import { getErrorMessage, readFileId } from "./files.helper.js";
import { deleteFile, findActiveFile, saveUploadedFile } from "./files.service.js";

export function registerFileRoutes(app: Hono): void {
  app.post("/api/files", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body.file;

      if (!(file instanceof File)) {
        throw new Error("file is required");
      }

      return c.json(await saveUploadedFile(file), 201);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
  app.get("/api/files/:id", async (c) => serveFile(c.req.param("id"), false));
  app.get("/api/files/:id/download", async (c) => serveFile(c.req.param("id"), true));
  app.delete("/api/files/:id", async (c) => {
    try {
      const deleted = await deleteFile(readFileId(c.req.param("id")));
      return deleted ? c.json({ ok: true }) : c.json({ error: "File not found" }, 404);
    } catch (error) {
      return c.json({ error: getErrorMessage(error) }, 400);
    }
  });
}

async function serveFile(value: string, download: boolean): Promise<Response> {
  try {
    const file = await findActiveFile(readFileId(value));

    if (!file) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    const headers = new Headers({
      "content-type": file.mimeType,
      "content-length": String(file.sizeBytes),
    });

    if (download) {
      headers.set("content-disposition", `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    }

    return new Response(await readFile(file.storagePath), { headers });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
