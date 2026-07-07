import {
  bigint,
  boolean,
  date,
  index,
  integer,
  type AnyPgColumn,
  pgTable,
  serial,
  text,
  timestamp,
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

export const todoMemos = pgTable("todo_memos", {
  id: serial("id").primaryKey(),
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
