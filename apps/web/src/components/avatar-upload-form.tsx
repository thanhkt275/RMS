"use client";

import { Camera, Upload, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createMutation } from "../utils/query-client";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_AVATAR_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

type AvatarSchema = {
  avatar: FileList | null;
};

type AvatarUploadResponse = {
  id: string;
  url: string;
  fileName: string;
  size: number;
  mimeType: string;
};

type AvatarUploadFormProps = {
  currentAvatar?: string;
  teamName: string;
  teamSlug: string;
  onSuccess?: (data: AvatarUploadResponse) => void;
  onCancel?: () => void;
};

export function AvatarUploadForm({
  currentAvatar,
  teamName,
  teamSlug,
  onSuccess,
  onCancel,
}: AvatarUploadFormProps) {
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
  } = useForm<AvatarSchema>({
    defaultValues: {
      avatar: null,
    },
  });

  const fileList = watch("avatar");
  const file = fileList?.[0];

  const mutation = createMutation<AvatarUploadResponse>({
    key: "teams",
    path: `${teamSlug}/avatar`,
    method: "post",
    onSuccess: (data) => {
      toast.success("Avatar updated successfully!");
      reset();
      setPreview(null);
      setUploadProgress(0);
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(error.message);
      setUploadProgress(0);
    },
  });

  const validateFile = (selectedFile: File): string | null => {
    if (selectedFile.size > MAX_AVATAR_SIZE) {
      return "Avatar size must be less than 5MB.";
    }
    if (!ACCEPTED_AVATAR_TYPES.includes(selectedFile.type)) {
      return "Please upload a valid image file (JPEG, PNG, GIF, or WebP).";
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

  const onSubmit = (data: AvatarSchema) => {
    if (!data.avatar?.[0]) {
      setValidationError("Avatar is required.");
      return;
    }

    const selectedFile = data.avatar[0];
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
          file: data.avatar[0],
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
      setValue("avatar", dataTransfer.files);
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Update Team Avatar</CardTitle>
            <CardDescription>
              Upload a new avatar for {teamName}. Recommended size: 256x256px or
              larger.
            </CardDescription>
          </div>
          {onCancel && (
            <Button onClick={onCancel} size="sm" variant="outline">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {/* Current Avatar Preview */}
          <div className="flex justify-center">
            <Avatar className="h-24 w-24">
              <AvatarImage alt={teamName} src={preview || currentAvatar} />
              <AvatarFallback className="text-lg">
                {teamName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Drag and Drop Area */}
          {/* biome-ignore lint: Buttons inside handle interactivity */}
          <div
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              file && "border-primary"
            )}
            onClick={() => !file && fileInputRef.current?.click()}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            role="presentation"
          >
            {file ? (
              <div className="space-y-4">
                {/* Preview */}
                {preview && (
                  <div className="relative mx-auto h-32 w-32">
                    <img
                      alt="Avatar preview"
                      className="h-full w-full rounded-full object-cover"
                      height={128}
                      src={preview}
                      width={128}
                    />
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
                  <Camera className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">
                    Drag and drop your avatar here, or click to browse
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Supported: JPEG, PNG, GIF, WebP (Max 5MB)
                  </p>
                </div>
                <input
                  type="file"
                  {...register("avatar", {
                    onChange: (e) => {
                      const files = e.target.files?.[0];
                      if (files) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(files);
                        setValue("avatar", dataTransfer.files);
                        handleFileChange(files);
                      }
                    },
                  })}
                  accept={ACCEPTED_AVATAR_TYPES.join(",")}
                  className="hidden"
                  id="avatar-input"
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
            {isSubmitting ? "Uploading..." : "Update Avatar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
