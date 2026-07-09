import { files } from "../../common/schema.js";

export type FileRow = typeof files.$inferSelect;

export type UploadedFileInput = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};
