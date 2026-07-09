import { slackListSources, workspaceUsers } from "../../common/schema.js";

export type WorkspaceUserRow = typeof workspaceUsers.$inferSelect;
export type SlackListSourceRow = typeof slackListSources.$inferSelect;

export type WorkspaceUser = {
  id: number;
  name: string;
  slackUserId: string | null;
  profileImageFileId: number | null;
  profileImageUrl: string | null;
  isMe: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceUserCurrentTask = {
  id: number;
  sourceId: number;
  sourceName: string;
  slackItemId: string;
  title: string;
  status: string | null;
  lastSeenAt: string;
};

export type WorkspaceUserStatus = {
  user: WorkspaceUser;
  status: "working" | "idle";
  currentTasks: WorkspaceUserCurrentTask[];
};

export type WorkspaceUserInput = {
  name: string;
  slackUserId: string | null;
  profileImageFileId: number | null;
  isMe: boolean;
};
