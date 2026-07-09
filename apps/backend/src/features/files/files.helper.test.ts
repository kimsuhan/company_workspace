import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStoredFileName, extractFileIdsFromContent, findOrphanFileIds, readUploadedFileInput } from "./files.helper.js";

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

test("extractFileIdsFromContent reads inline and download file URLs", () => {
  assert.deepEqual(
    extractFileIdsFromContent('<img src="/api/files/12"><a href="/api/files/34/download">file</a><img src="/api/files/pending">'),
    new Set([12, 34]),
  );
});

test("findOrphanFileIds returns active files without references", () => {
  assert.deepEqual(findOrphanFileIds([1, 2, 3], new Set([2])), [1, 3]);
});
