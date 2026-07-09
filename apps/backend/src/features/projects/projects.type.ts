import { projectHealthRecords, projectNodes, projects } from "../../common/schema.js";

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectHealthRecordRow = typeof projectHealthRecords.$inferSelect;
export type ProjectNodeRow = typeof projectNodes.$inferSelect;
export type ProjectNodeType = "folder" | "document";
export type ProjectHealthStatus = "healthy" | "unhealthy";
export type LogoVariant = "black" | "white";
export type ProjectHealthFetch = (input: string, init: { signal: AbortSignal }) => Promise<Response>;

export type Project = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoFileId: number | null;
  logoVariant: LogoVariant;
  healthApiUrl: string | null;
  health: ProjectHealth | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectHealth = {
  status: ProjectHealthStatus;
  checkedAt: string;
  responseTimeMs: number | null;
  history: ProjectHealthRecord[];
};

export type ProjectHealthRecord = {
  checkedAt: string;
  status: ProjectHealthStatus;
  responseTimeMs: number | null;
};

export type ProjectHealthResult = {
  status: ProjectHealthStatus;
  responseTimeMs: number | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: Date;
};

export type ProjectNode = {
  id: number;
  projectId: number;
  parentId: number | null;
  type: ProjectNodeType;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  children: ProjectNode[];
};

export type ProjectInput = {
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoFileId: number | null;
  logoVariant: LogoVariant;
  healthApiUrl: string | null;
};

export type ProjectNodeInput = {
  type: ProjectNodeType;
  title: string;
  parentId: number | null;
  content: string;
};

export type ProjectNodeMoveInput = {
  parentId: number | null;
  sortOrder: number;
};
