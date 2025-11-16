# File Upload Implementation Guide

## ✅ **YES - It saves to database AND gets the link!**

## How It Works

### 1. **Database Storage** ✓

The implementation **automatically saves** all file metadata to the `files` table in your database:

- File ID (UUID)
- Original filename
- Generated filename
- File path
- **Public URL** (the link you need)
- MIME type
- File size
- Category (IMAGE, DOCUMENT, OTHER)
- Who uploaded it
- Upload timestamp
- Metadata (user agent, etc.)

### 2. **File Link Generation** ✓

The API **returns the public URL** that can be used to access the file:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "http://localhost:3000/api/files/serve/file.jpg", // ← This is the link!
  "fileName": "550e8400-e29b-41d4-a716-446655440000-photo.jpg",
  "originalName": "photo.jpg",
  "size": 2048576,
  "mimeType": "image/jpeg",
  "category": "IMAGE"
}
```

## Development vs Production

### **Development Mode** (Local Storage)

When the S3 credentials (`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) are **not set**, files are saved locally:

- ✅ Files saved to `./uploads` folder
- ✅ Served via `/api/files/serve/*` endpoint
- ✅ URL: `http://localhost:3000/api/files/serve/{filename}`
- ✅ **Works out of the box** - no external services needed!

### **Production Mode** (AWS S3 via Bun)

When the S3 credentials are configured, Bun’s native `S3Client` uploads directly to your AWS S3 (or any S3-compatible) bucket:

- ✅ Files uploaded to cloud storage (S3, R2, etc.)
- ✅ URL from cloud storage provider
- ✅ Scalable, fast, and handled entirely inside the Bun runtime

## Setup Instructions

### Development (No Setup Needed!)

Just start your server:

```bash
cd /home/thanhkt/rms-modern
bun run dev
```

Files will be saved to `./uploads` automatically!

### Production Setup

1. **Choose a storage provider**:

   - **Cloudflare R2** (recommended, S3-compatible)
   - **AWS S3**
   - **Bun's native storage**
   - Any S3-compatible storage

2. **Configure AWS credentials** (Bun MCP S3 server):

   ```bash
   # apps/server/.env
   S3_BUCKET="your-bucket-name"
   S3_REGION="ap-southeast-1"
   S3_ACCESS_KEY_ID="AKIA..."
   S3_SECRET_ACCESS_KEY="********"
   # Optional helpers
   S3_PUBLIC_URL="https://cdn.example.com"   # For CloudFront/CDN URLs
   S3_ENDPOINT="https://s3.ap-southeast-1.amazonaws.com" # For custom endpoints/R2
   ```

3. **That's it.** Bun’s built-in S3 client streams the file to S3, marks it `public-read`, and the API stores the resulting URL in the database automatically—no proxy upload service required.

## API Endpoints

### Upload File

```http
POST /api/files/upload
Content-Type: multipart/form-data

file: [binary data]
```

**Response:**

```json
{
  "id": "uuid",
  "url": "http://localhost:3000/api/files/serve/file.jpg",
  "fileName": "uuid-originalname.jpg",
  "originalName": "originalname.jpg",
  "size": 2048576,
  "mimeType": "image/jpeg",
  "category": "IMAGE"
}
```

### Get File by ID

```http
GET /api/files/:id
```

### List User's Files

```http
GET /api/files/
```

### Delete File

```http
DELETE /api/files/:id
```

## Features

✅ **Automatic Environment Detection**: Works in development and production
✅ **Database Persistence**: All metadata saved to SQLite
✅ **Authentication**: Only logged-in users can upload
✅ **File Validation**: Size (10MB max) and type checking
✅ **Security**: User-scoped access control
✅ **Soft Delete**: Files marked as deleted, not removed
✅ **Local Development**: No external dependencies needed
✅ **Production Ready**: Easy switch to cloud storage

## Integration with Frontend

The frontend component (`file-upload-form.tsx`) automatically:

- Shows upload progress
- Validates files before upload
- Displays preview for images
- Handles drag & drop
- Returns the file URL on success

```tsx
import { FileUploadForm } from "@/components/file-upload-form";

// Use it anywhere
<FileUploadForm />;
```

## Troubleshooting

### Drizzle ORM Version Conflicts

If you see TypeScript errors about Drizzle:

```bash
cd /home/thanhkt/rms-modern
bun install --force
```

This will resolve the duplicate drizzle-orm versions in node_modules.

### Uploads Folder Permission

If files can't be saved locally:

```bash
mkdir -p /home/thanhkt/rms-modern/uploads
chmod 755 /home/thanhkt/rms-modern/uploads
```

## Summary

**YES, it works!**

- ✅ Saves all file info to database
- ✅ Returns public URL you can use
- ✅ Works in development (local files)
- ✅ Works in production (cloud storage)
- ✅ Zero external dependencies for development
- ✅ Easy migration to production

Just add your S3 credentials when you deploy!
