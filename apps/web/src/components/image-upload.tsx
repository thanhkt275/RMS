import { Camera, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileUpload,
  type FileUploadConfig,
  IMAGE_UPLOAD_CONFIG,
  type UploadedFile,
} from "./file-upload";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

/**
 * Simple file input component for custom upload handlers
 */
type SimpleImageUploadProps = {
  customUploadHandler: (file: File) => Promise<void>;
  uploadConfig: FileUploadConfig;
  uploading: boolean;
  icon?: React.ReactNode;
};

function SimpleImageUpload({
  customUploadHandler,
  uploadConfig,
  uploading,
  icon,
}: SimpleImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const maxSize = uploadConfig.maxSize || 5 * 1024 * 1024;
    const acceptedTypes = uploadConfig.acceptedTypes || [];

    if (file.size > maxSize) {
      return `File size exceeds maximum allowed size of ${Math.round(maxSize / 1024 / 1024)}MB`;
    }
    if (acceptedTypes.length > 0 && !acceptedTypes.includes(file.type)) {
      return "File type not supported";
    }
    return null;
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    await customUploadHandler(file);

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        accept={uploadConfig.acceptedTypes?.join(",")}
        className="hidden"
        disabled={uploading}
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
      <Button
        className="w-full gap-2"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        type="button"
        variant="secondary"
      >
        {uploading ? (
          "Uploading..."
        ) : (
          <>
            {icon || <Upload className="h-4 w-4" />}
            Upload Image
          </>
        )}
      </Button>
      {uploadConfig.helperText && (
        <p className="text-muted-foreground text-xs">
          {uploadConfig.helperText}
        </p>
      )}
    </div>
  );
}

type ImageUploadProps = {
  /** Current image URL */
  currentImage?: string;
  /** Title for the upload card */
  title: string;
  /** Description text */
  description?: string;
  /** Alternative text for image */
  altText: string;
  /** Callback when upload succeeds (only used with FileUpload default handler) */
  onSuccess?: (file: UploadedFile) => void;
  /** Callback when cancelled */
  onCancel?: () => void;
  /** Whether this is an avatar (circular) or regular image */
  variant?: "avatar" | "cover";
  /** Upload configuration (when using default FileUpload) */
  uploadConfig?: typeof IMAGE_UPLOAD_CONFIG;
  /** Custom upload handler that bypasses FileUpload component */
  customUploadHandler?: (file: File) => Promise<void>;
  /** Icon to show on upload button */
  uploadButtonIcon?: React.ReactNode;
  /** Whether upload is in progress */
  uploading?: boolean;
};

export function ImageUpload({
  currentImage,
  title,
  description,
  altText,
  onSuccess,
  onCancel,
  variant = "avatar",
  uploadConfig = IMAGE_UPLOAD_CONFIG,
  customUploadHandler,
  uploadButtonIcon,
  uploading = false,
}: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleUploadSuccess = (file: UploadedFile) => {
    setPreviewUrl(file.url);
    onSuccess?.(file);
  };

  const displayImage = previewUrl || currentImage;
  const isAvatar = variant === "avatar";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {onCancel && (
            <Button onClick={onCancel} size="sm" variant="outline">
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Image Preview */}
        <div className="flex justify-center">
          {isAvatar ? (
            <Avatar className="h-24 w-24">
              <AvatarImage alt={altText} src={displayImage} />
              <AvatarFallback className="text-lg">
                <Camera className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="relative h-48 w-full overflow-hidden rounded-lg border bg-muted">
              {displayImage ? (
                <img
                  alt={altText}
                  className="h-full w-full object-cover"
                  height={192}
                  src={displayImage}
                  width="100%"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Camera className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* File Upload Component */}
        {customUploadHandler ? (
          <SimpleImageUpload
            customUploadHandler={customUploadHandler}
            icon={uploadButtonIcon}
            uploadConfig={uploadConfig}
            uploading={uploading}
          />
        ) : (
          <FileUpload
            config={uploadConfig}
            onUploadSuccess={handleUploadSuccess}
            uploadButtonText={`Upload ${isAvatar ? "Avatar" : "Image"}`}
            uploading={uploading}
          />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Specialized component for avatar uploads with team/user context
 */
type AvatarUploadProps = {
  currentAvatar?: string;
  entityName: string;
  entityType: "team" | "user";
  onSuccess?: (file: UploadedFile) => void;
  onCancel?: () => void;
  uploading?: boolean;
};

export function AvatarUpload({
  currentAvatar,
  entityName,
  entityType,
  onSuccess,
  onCancel,
  uploading = false,
}: AvatarUploadProps) {
  return (
    <ImageUpload
      altText={`${entityName} avatar`}
      currentImage={currentAvatar}
      description={`Upload a new avatar for ${entityName}. Recommended size: 256x256px or larger.`}
      onCancel={onCancel}
      onSuccess={onSuccess}
      title={`Update ${entityType === "team" ? "Team" : "User"} Avatar`}
      uploading={uploading}
      variant="avatar"
    />
  );
}

/**
 * Specialized component for cover image uploads
 */
type CoverImageUploadProps = {
  currentCover?: string;
  entityName: string;
  onSuccess?: (file: UploadedFile) => void;
  onCancel?: () => void;
  uploading?: boolean;
};

export function CoverImageUpload({
  currentCover,
  entityName,
  onSuccess,
  onCancel,
  uploading = false,
}: CoverImageUploadProps) {
  return (
    <ImageUpload
      altText={`${entityName} cover`}
      currentImage={currentCover}
      description={`Upload a new cover image for ${entityName}. Recommended size: 1920x320px or larger.`}
      onCancel={onCancel}
      onSuccess={onSuccess}
      title="Update Cover Image"
      uploading={uploading}
      variant="cover"
    />
  );
}
