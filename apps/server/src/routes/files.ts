import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "node:process";
import { auth } from "@rms-modern/auth";
import { db } from "@rms-modern/db";
import { files } from "@rms-modern/db/schema/files";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { formatS3Path, isS3Enabled, uploadFileToS3 } from "../utils/s3";

const filesRoute = new Hono();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // PDF
  "application/pdf",
  // Word documents
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Excel spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // PowerPoint presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text files
  "text/plain",
  "text/csv",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  // Other common formats
  "application/json",
  "application/xml",
  "text/xml",
];

// Determine if we're using local storage or cloud storage
const USE_LOCAL_STORAGE = !isS3Enabled();
const UPLOAD_DIR = join(process.cwd(), "uploads");
const BASE_URL = env.BETTER_AUTH_URL || "http://localhost:3000";

const sanitizeFileName = (name: string): string => {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "upload";
  }
  return trimmed.replace(/[^\w.-]/g, "_");
};

/**
 * Save file to local filesystem (development)
 */
async function saveFileLocally(
  file: File,
  fileId: string
): Promise<{ url: string; path: string }> {
  // Ensure upload directory exists
  await mkdir(UPLOAD_DIR, { recursive: true });

  // Generate filename with original extension
  const extension = file.name.split(".").pop() || "";
  const fileName = extension ? `${fileId}.${extension}` : fileId;
  const filePath = join(UPLOAD_DIR, fileName);

  // Convert File to ArrayBuffer and write to disk
  const arrayBuffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  // Return URL and path
  return {
    url: `${BASE_URL}/api/files/serve/${fileName}`,
    path: filePath,
  };
}

filesRoute.post("/upload", async (c: Context) => {
  // Check authentication
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw new HTTPException(401, {
      message: "Authentication required.",
    });
  }

  const userId = session.user.id;

  const body = await c.req.parseBody();
  const file = body.file;

  // Validate file exists
  if (!(file instanceof File)) {
    throw new HTTPException(400, {
      message: "A file must be provided.",
    });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new HTTPException(400, {
      message: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
    });
  }

  // Validate file type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new HTTPException(400, {
      message:
        "File type not supported. Allowed types: images, PDF, Word, Excel, PowerPoint, text files, CSV, and archives.",
    });
  }

  try {
    // Generate unique file ID
    const fileId = randomUUID();
    const safeOriginalName = sanitizeFileName(file.name);
    const fileName = `${fileId}-${safeOriginalName}`;

    // Upload to storage (local or cloud based on configuration)
    let storageData: { url: string; path: string };

    if (USE_LOCAL_STORAGE) {
      // Development: Save to local filesystem
      storageData = await saveFileLocally(file, fileId);
    } else {
      const key = `uploads/${session.user.id}/${fileName}`;
      const { url, key: storedKey } = await uploadFileToS3({
        file,
        key,
        acl: "public-read",
      });
      storageData = {
        url,
        path: formatS3Path(storedKey),
      };
    }

    // Determine file category
    let category: "IMAGE" | "DOCUMENT" | "OTHER" = "OTHER";
    if (file.type.startsWith("image/")) {
      category = "IMAGE";
    } else if (
      file.type === "application/pdf" ||
      file.type === "application/msword" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/vnd.ms-excel" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-powerpoint" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      file.type === "text/plain" ||
      file.type === "text/csv"
    ) {
      category = "DOCUMENT";
    }

    // Save to database
    const fileRecords = await db
      .insert(files)
      .values({
        id: fileId,
        originalName: file.name,
        fileName,
        filePath: storageData.path,
        publicUrl: storageData.url,
        mimeType: file.type,
        size: file.size,
        category,
        uploadedBy: userId,
        metadata: JSON.stringify({
          uploadedAt: new Date().toISOString(),
          userAgent: c.req.header("user-agent"),
        }),
      })
      .returning();

    const fileRecord = fileRecords[0];
    if (!fileRecord) {
      throw new HTTPException(500, {
        message: "Failed to create file record.",
      });
    }

    return c.json({
      id: fileRecord.id,
      url: fileRecord.publicUrl,
      fileName: fileRecord.fileName,
      originalName: fileRecord.originalName,
      size: fileRecord.size,
      mimeType: fileRecord.mimeType,
      category: fileRecord.category,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(500, {
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during file upload.",
    });
  }
});

// Get file by ID
filesRoute.get("/:id", async (c: Context) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw new HTTPException(401, {
      message: "Authentication required.",
    });
  }

  const fileId = c.req.param("id");

  const [fileRecord] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!fileRecord) {
    throw new HTTPException(404, {
      message: "File not found.",
    });
  }

  return c.json({
    id: fileRecord.id,
    url: fileRecord.publicUrl,
    fileName: fileRecord.fileName,
    originalName: fileRecord.originalName,
    size: fileRecord.size,
    mimeType: fileRecord.mimeType,
    category: fileRecord.category,
    createdAt: fileRecord.createdAt,
  });
});

// List user's files
filesRoute.get("/", async (c: Context) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw new HTTPException(401, {
      message: "Authentication required.",
    });
  }

  const userId = session.user.id;

  const userFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.uploadedBy, userId), isNull(files.deletedAt)))
    .orderBy(desc(files.createdAt));

  return c.json({
    files: userFiles.map((fileRecord: typeof files.$inferSelect) => ({
      id: fileRecord.id,
      url: fileRecord.publicUrl,
      fileName: fileRecord.fileName,
      originalName: fileRecord.originalName,
      size: fileRecord.size,
      mimeType: fileRecord.mimeType,
      category: fileRecord.category,
      createdAt: fileRecord.createdAt,
    })),
  });
});

// Delete file (soft delete)
filesRoute.delete("/:id", async (c: Context) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw new HTTPException(401, {
      message: "Authentication required.",
    });
  }

  const userId = session.user.id;
  const fileId = c.req.param("id");

  const [fileRecord] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!fileRecord) {
    throw new HTTPException(404, {
      message: "File not found.",
    });
  }

  if (fileRecord.uploadedBy !== userId) {
    throw new HTTPException(403, {
      message: "You do not have permission to delete this file.",
    });
  }

  await db
    .update(files)
    .set({ deletedAt: new Date() })
    .where(eq(files.id, fileId));

  return c.json({ success: true, message: "File deleted successfully." });
});

// Serve static files (for local development)
if (USE_LOCAL_STORAGE) {
  filesRoute.get("/serve/:fileName", async (c: Context) => {
    const { fileName } = c.req.param();
    const filePath = join(UPLOAD_DIR, fileName);

    try {
      const fileContent = await readFile(filePath);

      const extension = fileName.split(".").pop()?.toLowerCase() || "";
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        pdf: "application/pdf",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ppt: "application/vnd.ms-powerpoint",
        pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        txt: "text/plain",
        csv: "text/csv",
        zip: "application/zip",
        rar: "application/x-rar-compressed",
        "7z": "application/x-7z-compressed",
        json: "application/json",
        xml: "application/xml",
      };

      const mimeType = mimeTypes[extension] || "application/octet-stream";

      c.header("Content-Type", mimeType);
      return c.body(fileContent);
    } catch {
      throw new HTTPException(404, { message: "File not found" });
    }
  });
}

export { filesRoute };
