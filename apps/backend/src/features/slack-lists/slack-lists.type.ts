import { slackListItems, slackListSources, workspaceUsers } from "../../common/schema.js";

export type SlackListFieldMapping = {
  columnId?: string;
  key?: string;
  type?: string;
  label?: string;
  sampleValue?: string;
  optionLabels?: Record<string, string>;
  dashboardValues?: string[];
  inProgressValues?: string[];
  doneValues?: string[];
  display?: boolean;
  writable?: boolean;
  role?: SlackListFieldRole;
};

export type SlackMappedField = {
  label: string;
  value: unknown;
  type: string;
  display: boolean;
  writable: boolean;
  columnId: string | null;
  dashboardValues?: string[];
  role?: SlackListFieldRole;
  userIds?: string[];
};

export type SlackListFieldRole = "assignee" | "status" | "title" | "done" | "none";

export type WorkspaceUserSummary = {
  id: number;
  name: string;
  slackUserId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SlackListFilterCondition = {
  field: string;
  op: "eq" | "in" | "contains" | "exists";
  value?: unknown;
};

export type SlackListFilter = {
  all?: SlackListFilterCondition[];
};

export type SlackListItemField = {
  key?: string;
  value?: unknown;
  column_id?: string;
  text?: string;
  select?: string[];
  user?: string[];
  channel?: string[];
  date?: string[];
  number?: number[];
  checkbox?: boolean[];
  email?: string[];
  phone?: string[];
  rating?: number[];
  attachment?: string[];
  message?: { value?: string; channel_id?: string; ts?: string; thread_ts?: string }[];
  link?: { originalUrl?: string; displayName?: string }[];
};

export type SlackListItem = {
  id: string;
  list_id: string;
  date_created?: number;
  updated_timestamp?: string;
  fields?: SlackListItemField[];
  archived?: boolean;
};

export type SlackListSchemaColumn = {
  id?: string;
  name?: string;
  key?: string;
  type?: string;
  options?: {
    choices?: { value?: string; label?: string }[];
  };
};

export type SlackListItemsResponse = {
  ok: boolean;
  items?: SlackListItem[];
  response_metadata?: { next_cursor?: string };
  error?: string;
};

export type SlackListItemInfoResponse = {
  ok: boolean;
  list?: {
    list_metadata?: {
      schema?: SlackListSchemaColumn[];
    };
  };
  error?: string;
};

export type SlackListDownloadStartResponse = {
  ok: boolean;
  job_id?: string;
  error?: string;
};

export type SlackListDownloadGetResponse = {
  ok: boolean;
  status?: string;
  download_url?: string;
  error?: string;
};

export type SlackListItemUpdateResponse = {
  ok: boolean;
  error?: string;
};

export type SlackListFieldPreview = {
  key: string;
  label: string;
  columnId: string;
  type: string;
  sampleValue: string;
  optionLabels?: Record<string, string>;
  display: boolean;
  writable: boolean;
};

export type SlackListSourceRow = typeof slackListSources.$inferSelect;
export type SlackListItemRow = typeof slackListItems.$inferSelect;
export type WorkspaceUserRow = typeof workspaceUsers.$inferSelect;

export type SlackListSourceInput = {
  name?: unknown;
  listId?: unknown;
  fieldMapping?: unknown;
  fieldMappings?: unknown;
  filterConfig?: unknown;
  filterRules?: unknown;
  isActive?: unknown;
};

export type SlackListItemResponse = {
  id: number;
  sourceId: number;
  sourceName: string | null;
  slackItemId: string;
  title: string;
  mappedFields: Record<string, SlackMappedField>;
  assignedUsers: WorkspaceUserSummary[];
  fieldRoles: Partial<Record<Exclude<SlackListFieldRole, "none">, string>>;
  rawItem: unknown;
  isActive: boolean;
  slackCreatedAt: string | null;
  slackUpdatedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};
