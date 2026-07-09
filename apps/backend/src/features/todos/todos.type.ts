import { todoComments, todoMemos } from "../../common/schema.js";

export type TodoRow = typeof todoMemos.$inferSelect;
export type TodoCommentRow = typeof todoComments.$inferSelect;

export type TodoComment = {
  id: number;
  todoMemoId: number;
  body: string;
  createdAt: string;
};

export type TodoMemo = {
  id: number;
  projectId: number;
  title: string;
  content: string;
  color: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  comments: TodoComment[];
};

export type TodoCreateInput = {
  projectId: unknown;
  title: unknown;
  content: unknown;
  color?: unknown;
  dueDate: unknown;
};

export type TodoUpdateInput = {
  projectId?: unknown;
  title?: unknown;
  content?: unknown;
  color?: unknown;
  dueDate?: unknown;
  isCompleted?: unknown;
};
