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
  });
  assert.deepEqual(readWorkspaceUserInput({ name: "김수한", slackUserId: "" }), {
    name: "김수한",
    slackUserId: null,
  });
  assert.throws(() => readWorkspaceUserInput({ name: "" }), /name is required/);
  assert.throws(() => readWorkspaceUserInput({ name: "김수한", slackUserId: "kim" }), /slackUserId must be a Slack user ID/);
});

test("getWorkspaceUserSaveErrorMessage handles Slack user ID uniqueness", () => {
  assert.equal(
    getWorkspaceUserSaveErrorMessage({ code: "23505", constraint_name: "workspace_users_slack_user_id_unique" }),
    "Slack User ID is already mapped",
  );
  assert.equal(getWorkspaceUserSaveErrorMessage(new Error("bad request")), "bad request");
});
