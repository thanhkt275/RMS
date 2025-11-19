import { FileText, Loader2, Upload } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

export type FileUploadConfig = {
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Accepted MIME types */
  acceptedTypes?: string[];
  /** Helper text to display */
  helperText?: string;
  /** Whether to show preview for images */
  showPreview?: boolean;
  /** Whether to show confirmation dialog before upload */
  showConfirmDialog?: boolean;
  /** Whether multiple files can be selected */
  multiple?: boolean;
};

export type UploadedFile = {
  id: string;
  fileName: string;
  originalName: string;
  url: string;
  size?: number;
  mimeType?: string;
};

type FileUploadProps = {
  /** Configuration for file validation and behavior */
  config?: FileUploadConfig;
  /** Callback when file is successfully uploaded */
  onUploadSuccess?: (file: UploadedFile) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error) => void;
  /** Whether upload is in progress (controlled from parent) */
  uploading?: boolean;
  /** Current uploaded file info */
  currentFile?: {
    fileName: string;
    url?: string;
  };
  /** Custom upload button text */
  uploadButtonText?: string;
  /** Disabled state */
  disabled?: boolean;
};

const DEFAULT_CONFIG: Required<FileUploadConfig> = {
  maxSize: 10 * 1024 * 1024, // 10MB
  acceptedTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
  helperText: "Supported: Images, PDF, Word, Excel, Text (Max 10MB)",
  showPreview: true,
  showConfirmDialog: true,
  multiple: false,
};

// Preset configurations for common use cases
export const IMAGE_UPLOAD_CONFIG: FileUploadConfig = {
  maxSize: 5 * 1024 * 1024, // 5MB
  acceptedTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ],
  helperText: "Supported: JPEG, PNG, GIF, WebP (Max 5MB)",
  showPreview: true,
  showConfirmDialog: true,
};

export const DOCUMENT_UPLOAD_CONFIG: FileUploadConfig = {
  maxSize: 15 * 1024 * 1024, // 15MB
  acceptedTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
  helperText: "Supported: PDF, Word, Excel, Text (Max 15MB)",
  showPreview: false,
  showConfirmDialog: true,
};

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: File upload requires multiple state management and conditional rendering
export function FileUpload({
  config,
  onUploadSuccess,
  onUploadError,
  uploading: externalUploading = false,
  currentFile,
  uploadButtonText = "Upload document",
  disabled = false,
}: FileUploadProps) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [internalUploading, setInternalUploading] = useState(false);

  const isUploading = externalUploading || internalUploading;
  const canInteract = !(disabled || isUploading);

  const validateFile = (file: File): string | null => {
    if (file.size > mergedConfig.maxSize) {
      return `File size exceeds maximum allowed size of ${formatFileSize(mergedConfig.maxSize)}`;
    }
    if (!mergedConfig.acceptedTypes.includes(file.type)) {
      return "File type not supported";
    }
    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setSelectedFile(file);

    // Generate preview for images
    const shouldShowPreview =
      file.type.startsWith("image/") && mergedConfig.showPreview;
    if (shouldShowPreview) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // If no confirmation dialog, upload immediately
    if (!mergedConfig.showConfirmDialog) {
      uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setInternalUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${SERVER_URL}/api/files/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Unable to upload file");
      }

      const data = (await response.json()) as UploadedFile;
      toast.success("File uploaded successfully");
      onUploadSuccess?.(data);
      clearSelection();
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error("Upload failed");
      toast.error(errorObj.message);
      onUploadError?.(errorObj);
    } finally {
      setInternalUploading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedFile) {
      uploadFile(selectedFile);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (canInteract) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (!canInteract) {
      return;
    }

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleClick = () => {
    if (canInteract) {
      inputRef.current?.click();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (canInteract && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const shouldShowNonImagePreview = () => {
    if (!selectedFile) {
      return false;
    }
    if (previewUrl) {
      return false;
    }
    return !selectedFile.type.startsWith("image/");
  };

  return (
    <>
      <div className="space-y-2">
        <input
          accept={mergedConfig.acceptedTypes.join(",")}
          className="hidden"
          disabled={disabled || isUploading}
          multiple={mergedConfig.multiple}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              handleFileSelect(file);
            }
          }}
          ref={inputRef}
          type="file"
        />

        {/* Drag and Drop Zone */}
        {/* biome-ignore lint/a11y/useSemanticElements: Div needed for drag-and-drop functionality */}
        <div
          className={cn(
            "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50",
            !canInteract && "cursor-not-allowed opacity-50"
          )}
          onClick={handleClick}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onKeyDown={handleKeyPress}
          role="button"
          tabIndex={canInteract ? 0 : -1}
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-sm">
            {isDragging ? "Drop file here" : "Drag and drop or click to browse"}
          </p>
          {mergedConfig.helperText && (
            <p className="mt-1 text-muted-foreground text-xs">
              {mergedConfig.helperText}
            </p>
          )}
        </div>

        {/* Upload Button */}
        <Button
          className="gap-2"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
          type="button"
          variant="secondary"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {uploadButtonText}
            </>
          )}
        </Button>

        {/* Helper Text */}
        {currentFile && (
          <p className="text-muted-foreground text-sm">
            Current file: {currentFile.fileName}
          </p>
        )}
      </div>

      {/* Confirmation Dialog */}
      {mergedConfig.showConfirmDialog && (
        <Dialog
          onOpenChange={(open) => !open && clearSelection()}
          open={!!selectedFile}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review file before upload</DialogTitle>
              <DialogDescription>
                Please review the file details before uploading.
              </DialogDescription>
            </DialogHeader>

            {selectedFile && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <p className="font-medium text-sm">File name</p>
                        <p className="break-all text-muted-foreground text-sm">
                          {selectedFile.name}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="font-medium text-sm">File size</p>
                      <p className="text-muted-foreground text-sm">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>

                    <div>
                      <p className="font-medium text-sm">File type</p>
                      <p className="text-muted-foreground text-sm">
                        {selectedFile.type || "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>

                {previewUrl && (
                  <div className="rounded-lg border p-4">
                    <p className="mb-2 font-medium text-sm">Preview</p>
                    <div className="flex justify-center">
                      <img
                        alt="File preview"
                        className="max-h-[400px] max-w-full rounded-lg object-contain"
                        height={400}
                        src={previewUrl}
                        width="auto"
                      />
                    </div>
                  </div>
                )}

                {shouldShowNonImagePreview() && (
                  <div className="flex items-center justify-center rounded-lg border border-dashed p-8">
                    <div className="text-center">
                      <FileText className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground text-sm">
                        Preview not available for this file type
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                disabled={isUploading}
                onClick={clearSelection}
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isUploading} onClick={handleConfirm}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Confirm & Upload"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * Simplified file upload component without drag & drop or confirmation dialog
 */
export function SimpleFileUpload({
  config,
  onUploadSuccess,
  onUploadError,
  uploading = false,
  currentFile,
  uploadButtonText = "Upload",
  disabled = false,
}: FileUploadProps) {
  return (
    <FileUpload
      config={{
        ...config,
        showConfirmDialog: false,
      }}
      currentFile={currentFile}
      disabled={disabled}
      onUploadError={onUploadError}
      onUploadSuccess={onUploadSuccess}
      uploadButtonText={uploadButtonText}
      uploading={uploading}
    />
  );
}
