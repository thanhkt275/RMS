import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const fileCategories = [
  "AVATAR",
  "TEAM_LOGO",
  "DOCUMENT",
  "IMAGE",
  "OTHER",
] as const;
export type FileCategory = (typeof fileCategories)[number];

export const files = sqliteTable("file", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  publicUrl: text("public_url").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  thumbnailPath: text("thumbnail_path"),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").$type<FileCategory>().notNull().default("OTHER"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => user.id),
  relatedEntityId: text("related_entity_id"),
  relatedEntityType: text("related_entity_type"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch('now'))`),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});
