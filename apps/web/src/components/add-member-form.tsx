import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { queryClient } from "@/utils/query-client";

type AddMemberFormProps = {
  teamSlug: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

type MemberToInvite = {
  email: string;
};

type InviteResult = {
  email: string;
  success: boolean;
  message: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type EmailField = {
  id: string;
  value: string;
};

const generateEmailFieldId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
};

const createEmailField = (value = ""): EmailField => ({
  id: generateEmailFieldId(),
  value,
});

export function AddMemberForm({
  teamSlug,
  onSuccess,
  onCancel,
}: AddMemberFormProps) {
  const [emails, setEmails] = useState<EmailField[]>([createEmailField()]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: async (members: MemberToInvite[]): Promise<InviteResult[]> => {
      const response = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/teams/${teamSlug}/invite/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ members }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to invite members");
      }

      const result = await response.json();
      return result.results;
    },
    onSuccess: async (results) => {
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (successful.length > 0) {
        toast.success(
          `Successfully added ${successful.length} member${
            successful.length !== 1 ? "s" : ""
          }`
        );
      }

      if (failed.length > 0) {
        for (const result of failed) {
          toast.error(`${result.email}: ${result.message}`);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["team", teamSlug] });
      await queryClient.invalidateQueries({ queryKey: ["teams"] });

      if (successful.length > 0) {
        setEmails([createEmailField()]);
        onSuccess?.();
      }

      setIsSubmitting(false);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Unable to add members.";
      toast.error(message);
      setIsSubmitting(false);
    },
  });

  const handleEmailChange = (fieldId: string, value: string) => {
    setEmails((prev) =>
      prev.map((field) => (field.id === fieldId ? { ...field, value } : field))
    );
  };

  const addEmailField = () => {
    setEmails((prev) => [...prev, createEmailField()]);
  };

  const removeEmailField = (fieldId: string) => {
    setEmails((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((field) => field.id !== fieldId);
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const validEmails = emails
      .map((field) => field.value.trim())
      .filter((value) => value);

    if (validEmails.length === 0) {
      toast.error("Please enter at least one email address.");
      return;
    }

    for (const email of validEmails) {
      if (!EMAIL_REGEX.test(email)) {
        toast.error(`Invalid email address: ${email}`);
        return;
      }
    }

    const members: MemberToInvite[] = validEmails.map((email) => ({
      email,
    }));

    setIsSubmitting(true);
    inviteMutation.mutate(members);
  };

  const validEmailCount = emails.filter(
    (field) => field.value.trim() && EMAIL_REGEX.test(field.value)
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Team Members</CardTitle>
        <CardDescription>
          Add new members to your team by providing their email addresses.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-3">
            {emails.map((field) => (
              <div className="flex items-center gap-2" key={field.id}>
                <Input
                  disabled={isSubmitting}
                  onChange={(e) => handleEmailChange(field.id, e.target.value)}
                  placeholder="john@example.com"
                  required
                  type="email"
                  value={field.value}
                />
                {emails.length > 1 && (
                  <Button
                    disabled={isSubmitting}
                    onClick={() => removeEmailField(field.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <span className="text-red-500 text-xl">×</span>
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            disabled={isSubmitting}
            onClick={addEmailField}
            type="button"
            variant="outline"
          >
            Add Another Email
          </Button>

          <div className="flex flex-wrap gap-3 pt-4">
            <Button
              disabled={isSubmitting || validEmailCount === 0}
              type="submit"
            >
              {isSubmitting
                ? "Adding..."
                : `Add ${validEmailCount || ""} Member${
                    validEmailCount !== 1 ? "s" : ""
                  }`}
            </Button>
            {onCancel && (
              <Button
                disabled={isSubmitting}
                onClick={onCancel}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
