import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getWorkspaceUserSaveErrorMessage,
  readWorkspaceUserInput,
} from "./workspace-users.js";

test("readWorkspaceUserInput requires name and normalizes optional Slack user ID", () => {
  assert.deepEqual(readWorkspaceUserInput({ name: "  김수한  ", slackUserId: " U08HELASRED " }), {
    name: "김수한",
    slackUserId: "U08HELASRED",
    profileImageFileId: null,
    isMe: false,
  });
  assert.deepEqual(readWorkspaceUserInput({ name: "김수한", slackUserId: "", profileImageFileId: 42, isMe: true }), {
    name: "김수한",
    slackUserId: null,
    profileImageFileId: 42,
    isMe: true,
  });
  assert.throws(() => readWorkspaceUserInput({ name: "" }), /name is required/);
  assert.throws(() => readWorkspaceUserInput({ name: "김수한", slackUserId: "kim" }), /slackUserId must be a Slack user ID/);
  assert.throws(() => readWorkspaceUserInput({ name: "김수한", profileImageFileId: -1 }), /profileImageFileId must be a positive integer/);
  assert.throws(() => readWorkspaceUserInput({ name: "김수한", isMe: "true" }), /isMe must be a boolean/);
});

test("getWorkspaceUserSaveErrorMessage handles Slack user ID uniqueness", () => {
  assert.equal(
    getWorkspaceUserSaveErrorMessage({ code: "23505", constraint_name: "workspace_users_slack_user_id_unique" }),
    "Slack User ID is already mapped",
  );
  assert.equal(getWorkspaceUserSaveErrorMessage(new Error("bad request")), "bad request");
});
