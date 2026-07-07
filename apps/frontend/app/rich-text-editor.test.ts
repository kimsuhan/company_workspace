import assert from "node:assert/strict";
import { test } from "node:test";

import { findFirstClipboardImage } from "./rich-text-editor.js";

test("findFirstClipboardImage returns the first pasted image file", () => {
  const textFile = new File(["hello"], "memo.txt", { type: "text/plain" });
  const imageFile = new File(["image"], "pasted.png", { type: "image/png" });

  assert.equal(findFirstClipboardImage([textFile, imageFile]), imageFile);
});

test("findFirstClipboardImage ignores non-image files", () => {
  const textFile = new File(["hello"], "memo.txt", { type: "text/plain" });

  assert.equal(findFirstClipboardImage([textFile]), null);
});
