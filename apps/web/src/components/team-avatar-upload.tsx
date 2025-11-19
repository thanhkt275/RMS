import { Camera } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IMAGE_UPLOAD_CONFIG } from "./file-upload";
import { ImageUpload } from "./image-upload";

type TeamAvatarUploadProps = {
  currentAvatar?: string;
  teamName: string;
  teamSlug: string;
  onSuccess?: (data: { url: string }) => void;
  onCancel?: () => void;
};

const SERVER_URL = import.meta.env.VITE_SERVER_URL;

/**
 * Custom avatar upload component that uploads directly to team avatar endpoint
 * This avoids the double upload issue (generic /api/files/upload + team endpoint)
 */
export function TeamAvatarUpload({
  currentAvatar,
  teamName,
  teamSlug,
  onSuccess,
  onCancel,
}: TeamAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    try {
      setUploading(true);

      // Upload directly to team avatar endpoint
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${SERVER_URL}/api/teams/${teamSlug}/avatar`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to upload avatar");
      }

      const data = await response.json();
      setPreviewUrl(data.url);
      toast.success("Avatar updated successfully!");
      onSuccess?.(data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload avatar"
      );
    } finally {
      setUploading(false);
    }
  };

  const displayImage = previewUrl || currentAvatar;

  return (
    <ImageUpload
      altText={`${teamName} avatar`}
      currentImage={displayImage}
      customUploadHandler={handleFileUpload}
      description={`Upload a new avatar for ${teamName}. Recommended size: 256x256px or larger.`}
      onCancel={onCancel}
      title="Update Team Avatar"
      uploadButtonIcon={<Camera className="h-4 w-4" />}
      uploadConfig={IMAGE_UPLOAD_CONFIG}
      uploading={uploading}
      variant="avatar"
    />
  );
}
