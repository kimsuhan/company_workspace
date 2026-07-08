import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  type AnyPgColumn,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const githubReviewPullRequests = pgTable("github_review_pull_requests", {
  id: serial("id").primaryKey(),
  githubIssueId: bigint("github_issue_id", { mode: "number" }).notNull().unique(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  branchName: text("branch_name"),
  author: text("author").notNull(),
  status: text("status").notNull(),
  isDraft: boolean("is_draft").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }).notNull(),
});

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  publicUrl: text("public_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  logoFileId: integer("logo_file_id").references(() => files.id, { onDelete: "set null" }),
  logoVariant: text("logo_variant").notNull().default("black"),
  healthApiUrl: text("health_api_url").unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const todoMemos = pgTable("todo_memos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  color: text("color").notNull().default("#1c69d4"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const todoComments = pgTable("todo_comments", {
  id: serial("id").primaryKey(),
  todoMemoId: integer("todo_memo_id")
    .notNull()
    .references(() => todoMemos.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    color: text("color").notNull().default("#f4b400"),
    noteDate: date("note_date"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notes_kind_archived_updated_idx").on(table.kind, table.isArchived, table.updatedAt),
    index("notes_note_date_idx").on(table.noteDate),
  ],
);

export const projectHealthRecords = pgTable(
  "project_health_records",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    responseTimeMs: integer("response_time_ms"),
    statusCode: integer("status_code"),
    error: text("error"),
  },
  (table) => [
    index("project_health_records_project_checked_at_idx").on(table.projectId, table.checkedAt),
  ],
);

export const projectNodes = pgTable(
  "project_nodes",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references((): AnyPgColumn => projectNodes.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("project_nodes_project_parent_sort_idx").on(table.projectId, table.parentId, table.sortOrder),
  ],
);

export const slackSettings = pgTable("slack_settings", {
  id: integer("id").primaryKey().default(1),
  botToken: text("bot_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const slackListSources = pgTable(
  "slack_list_sources",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    listId: text("list_id").notNull(),
    fieldMapping: jsonb("field_mapping").$type<Record<string, unknown>>().notNull().default({}),
    filterConfig: jsonb("filter_config").$type<Record<string, unknown>>().notNull().default({ all: [] }),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    syncBackoffUntil: timestamp("sync_backoff_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("slack_list_sources_active_idx").on(table.isActive, table.updatedAt),
  ],
);

export const slackListItems = pgTable(
  "slack_list_items",
  {
    id: serial("id").primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => slackListSources.id, { onDelete: "cascade" }),
    slackItemId: text("slack_item_id").notNull(),
    title: text("title").notNull(),
    mappedFields: jsonb("mapped_fields").$type<Record<string, unknown>>().notNull().default({}),
    rawItem: jsonb("raw_item").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    slackCreatedAt: timestamp("slack_created_at", { withTimezone: true }),
    slackUpdatedAt: timestamp("slack_updated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("slack_list_items_source_item_unique").on(table.sourceId, table.slackItemId),
    index("slack_list_items_source_active_idx").on(table.sourceId, table.isActive, table.lastSeenAt),
  ],
);
