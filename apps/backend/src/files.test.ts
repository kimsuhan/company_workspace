import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStoredFileName, readUploadedFileInput } from "./files.js";

test("readUploadedFileInput validates required file metadata", () => {
  assert.deepEqual(readUploadedFileInput({ name: " logo.png ", type: "image/png", size: 1024 }), {
    originalName: "logo.png",
    mimeType: "image/png",
    sizeBytes: 1024,
  });
  assert.throws(() => readUploadedFileInput({ name: "", type: "image/png", size: 1024 }), /file name is required/);
  assert.throws(() => readUploadedFileInput({ name: "logo.png", type: "", size: 1024 }), /mime type is required/);
  assert.throws(() => readUploadedFileInput({ name: "logo.png", type: "image/png", size: 10_000_001 }), /file is too large/);
});

test("buildStoredFileName keeps extension and removes unsafe name characters", () => {
  const name = buildStoredFileName("01", "내 로고.final.png");

  assert.equal(name, "01-final.png");
});
