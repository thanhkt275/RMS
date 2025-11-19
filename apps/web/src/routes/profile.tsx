import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { FileUploadForm } from "@/components/file-upload-form";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import {
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";

export const Route = createFileRoute("/profile")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const user = session.data?.user as AccessControlUser | undefined;
    if (!meetsAccessRule(user, ACCESS_RULES.registeredOnly)) {
      redirect({
        to: "/sign-in",
        throw: true,
      });
    }
    return { session };
  },
});

type FormFieldProps = {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  errors: unknown[];
  onChange: (value: string) => void;
  onBlur: () => void;
  maxValue?: string;
};

function FormField({
  name,
  label,
  placeholder,
  type = "text",
  value,
  errors,
  onChange,
  onBlur,
  maxValue,
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        max={maxValue}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {errors.map((error, index) => (
        <p className="text-red-500" key={String(error) || index}>
          {String(error) || "Error"}
        </p>
      ))}
    </div>
  );
}

function extractUserField(
  user: unknown,
  field: string,
  isDate = false
): string {
  if (typeof user !== "object" || user === null) {
    return "";
  }
  if (!(field in user)) {
    return "";
  }

  const value = (user as Record<string, unknown>)[field];
  if (isDate) {
    if (value instanceof Date) {
      const dateStr = value.toISOString().split("T")[0] ?? "";
      return dateStr;
    }
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function createPasswordValidator() {
  return z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
      confirmPassword: z
        .string()
        .min(8, "Password must be at least 8 characters"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    });
}

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  const user = session.data?.user ?? {};
  const phone = extractUserField(user, "phone");
  const dateOfBirth = extractUserField(user, "dateOfBirth", true);
  const school = extractUserField(user, "school");
  const location = extractUserField(user, "location");

  const profileForm = useForm({
    defaultValues: {
      name: session.data?.user.name || "",
      phone: phone || "",
      dateOfBirth: dateOfBirth || "",
      school: school || "",
      location: location || "",
    },
    onSubmit: async ({ value }) => {
      setIsUpdatingProfile(true);
      try {
        await authClient.updateUser({
          name: value.name,
          phone: value.phone,
          dateOfBirth: new Date(value.dateOfBirth),
          school: value.school,
          location: value.location,
        } as Parameters<typeof authClient.updateUser>[0]);
        toast.success("Profile updated successfully");
      } catch {
        toast.error("Failed to update profile");
      } finally {
        setIsUpdatingProfile(false);
      }
    },
  });

  const emailForm = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      setIsChangingEmail(true);
      try {
        await authClient.changeEmail({
          newEmail: value.email,
        });
        toast.success("Verification email sent to your new email address");
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to change email";
        toast.error(errorMessage);
      } finally {
        setIsChangingEmail(false);
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.string().email("Invalid email address"),
      }),
    },
  });

  const handlePasswordSubmit = async (value: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    if (value.newPassword !== value.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsChangingPassword(true);
    try {
      await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: false,
      });
      toast.success("Password changed successfully");
      passwordForm.reset();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to change password";
      toast.error(errorMessage);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      await handlePasswordSubmit(value);
    },
    validators: {
      onSubmit: createPasswordValidator(),
    },
  });

  if (!session.data) {
    return <Loader />;
  }

  const userRecord = session.data.user as Record<string, unknown>;

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="font-bold text-3xl">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your personal details and contact information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              profileForm.handleSubmit();
            }}
          >
            <profileForm.Field name="name">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="Full Name"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  value={field.state.value}
                />
              )}
            </profileForm.Field>

            <profileForm.Field name="phone">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="Phone Number"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  type="tel"
                  value={field.state.value}
                />
              )}
            </profileForm.Field>

            <profileForm.Field name="dateOfBirth">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="Date of Birth"
                  maxValue={new Date().toISOString().split("T")[0]}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  type="date"
                  value={field.state.value}
                />
              )}
            </profileForm.Field>

            <profileForm.Field name="school">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="School"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  placeholder="Your school or university"
                  value={field.state.value}
                />
              )}
            </profileForm.Field>

            <profileForm.Field name="location">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="Location"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  placeholder="City, State/Country"
                  value={field.state.value}
                />
              )}
            </profileForm.Field>

            <Button disabled={isUpdatingProfile} type="submit">
              {isUpdatingProfile ? "Updating..." : "Update Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Email Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Email Address</CardTitle>
          <CardDescription>
            Current email: {session.data.user.email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              emailForm.handleSubmit();
            }}
          >
            <emailForm.Field name="email">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="New Email Address"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  type="email"
                  value={field.state.value}
                />
              )}
            </emailForm.Field>

            <Button disabled={isChangingEmail} type="submit">
              {isChangingEmail ? "Sending..." : "Change Email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              passwordForm.handleSubmit();
            }}
          >
            <passwordForm.Field name="currentPassword">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="Current Password"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  type="password"
                  value={field.state.value}
                />
              )}
            </passwordForm.Field>

            <passwordForm.Field name="newPassword">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="New Password"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  type="password"
                  value={field.state.value}
                />
              )}
            </passwordForm.Field>

            <passwordForm.Field name="confirmPassword">
              {(field) => (
                <FormField
                  errors={field.state.meta.errors}
                  label="Confirm New Password"
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  type="password"
                  value={field.state.value}
                />
              )}
            </passwordForm.Field>

            <Button disabled={isChangingPassword} type="submit">
              {isChangingPassword ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>View your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Username:</span>
            <span className="font-medium">{userRecord.username as string}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account Type:</span>
            <span className="font-medium">
              {(userRecord.type as string) || "REGULAR"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role:</span>
            <span className="font-medium">
              {(userRecord.role as string) || "COMMON"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <FileUploadForm />
    </div>
  );
}
