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

export const Route = createFileRoute("/profile")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/sign-in",
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  const profileForm = useForm({
    defaultValues: {
      name: session.data?.user.name || "",
      phone:
        ((session.data?.user as Record<string, unknown>).phone as string) || "",
      dateOfBirth:
        session.data?.user.dateOfBirth instanceof Date
          ? session.data.user.dateOfBirth.toISOString().split("T")[0]
          : "",
      school:
        ((session.data?.user as Record<string, unknown>).school as string) ||
        "",
      location:
        ((session.data?.user as Record<string, unknown>).location as string) ||
        "",
    },
    onSubmit: async ({ value }) => {
      setIsUpdatingProfile(true);
      try {
        await authClient.updateUser({
          name: value.name,
          // @ts-expect-error - additional fields
          phone: value.phone,
          // @ts-expect-error - additional fields
          dateOfBirth: new Date(value.dateOfBirth),
          // @ts-expect-error - additional fields
          school: value.school,
          // @ts-expect-error - additional fields
          location: value.location,
        });
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

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
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
    },
    validators: {
      onSubmit: z
        .object({
          currentPassword: z.string().min(1, "Current password is required"),
          newPassword: z
            .string()
            .min(8, "Password must be at least 8 characters"),
          confirmPassword: z
            .string()
            .min(8, "Password must be at least 8 characters"),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
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
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Full Name</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
              )}
            </profileForm.Field>

            <profileForm.Field name="phone">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Phone Number</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="tel"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
              )}
            </profileForm.Field>

            <profileForm.Field name="dateOfBirth">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Date of Birth</Label>
                  <Input
                    id={field.name}
                    max={new Date().toISOString().split("T")[0]}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="date"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
              )}
            </profileForm.Field>

            <profileForm.Field name="school">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>School</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Your school or university"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
              )}
            </profileForm.Field>

            <profileForm.Field name="location">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Location</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="City, State/Country"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor={field.name}>New Email Address</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="email"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Current Password</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="newPassword">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>New Password</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
              )}
            </passwordForm.Field>

            <passwordForm.Field name="confirmPassword">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Confirm New Password</Label>
                  <Input
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.map((error, index) => (
                    <p className="text-red-500" key={error?.message || index}>
                      {error?.message || "Error"}
                    </p>
                  ))}
                </div>
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
