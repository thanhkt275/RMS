"use client";

import { FileIcon, Upload, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createMutation } from "../utils/query-client";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

type FormSchema = {
  file: FileList | null;
};

type UploadResponse = {
  id: string;
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
};

export function FileUploadForm() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
    setValue,
    watch,
    reset,
  } = useForm<FormSchema>({
    defaultValues: {
      file: null,
    },
  });

  const fileList = watch("file");
  const file = fileList?.[0];

  const mutation = createMutation<UploadResponse>({
    key: "files",
    path: "upload",
    method: "post",
    onSuccess: (data) => {
      toast.success(`File uploaded successfully: ${data.fileName}`);
      reset();
      setPreview(null);
      setUploadProgress(0);
    },
    onError: (error) => {
      toast.error(error.message);
      setUploadProgress(0);
    },
  });

  const validateFile = (selectedFile: File): string | null => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      return "File size must be less than 10MB.";
    }
    if (!ACCEPTED_FILE_TYPES.includes(selectedFile.type)) {
      return "File type not supported. Please upload an image, PDF, or document.";
    }
    return null;
  };

  const handleFileChange = (selectedFile: File | undefined) => {
    if (!selectedFile) {
      setPreview(null);
      setValidationError(null);
      return;
    }

    // Validate file
    const error = validateFile(selectedFile);
    setValidationError(error);

    // Generate preview for images
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const onSubmit = (data: FormSchema) => {
    if (!data.file?.[0]) {
      setValidationError("File is required.");
      return;
    }

    const selectedFile = data.file[0];
    const error = validateFile(selectedFile);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);

    // Simulate upload progress (in real app, use XMLHttpRequest for actual progress)
    setUploadProgress(10);
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    mutation.mutate(
      {
        form: {
          file: data.file[0],
        },
      },
      {
        onSettled: () => {
          clearInterval(progressInterval);
          setUploadProgress(100);
          setTimeout(() => setUploadProgress(0), 1000);
        },
      }
    );
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      setValue("file", dataTransfer.files);
      handleFileChange(droppedFile);
    }
  };

  const clearFile = () => {
    reset();
    setPreview(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>File Upload</CardTitle>
        <CardDescription>
          Upload images, PDFs, or documents (max 10MB)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {/* Drag and Drop Area */}
          {/* biome-ignore lint/a11y/useSemanticElements: Dropzone needs custom drag/drop and nested controls, so we keep a div with button semantics. */}
          <div
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              file && "border-primary"
            )}
            onClick={() => !file && fileInputRef.current?.click()}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !file) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
          >
            {file ? (
              <div className="space-y-4">
                {/* Preview */}
                {preview ? (
                  <div className="relative mx-auto h-48 w-48">
                    <img
                      alt="File preview"
                      className="h-full w-full rounded-lg object-cover"
                      height={192}
                      src={preview}
                      width={192}
                    />
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <FileIcon className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}

                {/* File Info */}
                <div className="space-y-1">
                  <p className="font-medium text-sm">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatFileSize(file.size)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-2">
                  <Button
                    onClick={clearFile}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Change File
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <Upload className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Drag and drop your file here, or click to browse
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Supported: Images, PDF, DOC, DOCX (Max 10MB)
                  </p>
                </div>
                <Input
                  type="file"
                  {...register("file", {
                    onChange: (e) => {
                      const selectedFile = e.target.files?.[0];
                      handleFileChange(selectedFile);
                    },
                  })}
                  accept={ACCEPTED_FILE_TYPES.join(",")}
                  className="hidden"
                  id="file-input"
                  ref={fileInputRef}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  Browse Files
                </Button>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-center text-muted-foreground text-xs">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}

          {/* Error Message */}
          {validationError && (
            <p className="text-destructive text-sm">{validationError}</p>
          )}

          {/* Submit Button */}
          <Button
            className="w-full"
            disabled={
              isSubmitting ||
              !file ||
              (uploadProgress > 0 && uploadProgress < 100) ||
              !!validationError
            }
            type="submit"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isSubmitting ? "Uploading..." : "Upload File"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
