import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ResetPasswordFormProps = {
  defaultToken?: string;
};

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(8, "Password must be at least 8 characters"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export default function ResetPasswordForm({
  defaultToken = "",
}: ResetPasswordFormProps) {
  const navigate = useNavigate({ from: "/reset-password" });
  const form = useForm({
    defaultValues: {
      token: defaultToken,
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      try {
        await authClient.$fetch("/reset-password", {
          method: "POST",
          body: {
            newPassword: value.password,
            token: value.token,
          },
        });

        toast.success("Password updated successfully.");
        navigate({ to: "/login" });
      } catch (error) {
        if (error instanceof Error) {
          toast.error(error.message);
          return;
        }
        toast.error("Unable to reset password right now.");
      }
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
  });

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-2 text-center font-bold text-3xl">
        Create new password
      </h1>
      <p className="mb-6 text-center text-muted-foreground text-sm">
        Enter the reset token from your email and choose a new password.
      </p>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div>
          <form.Field name="token">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Reset token</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  value={field.state.value}
                />
                {field.state.meta.errors.map((errorMessage) => (
                  <p className="text-red-500" key={errorMessage?.message}>
                    {errorMessage?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>New password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors.map((errorMessage) => (
                  <p className="text-red-500" key={errorMessage?.message}>
                    {errorMessage?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="confirmPassword">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Confirm password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors.map((errorMessage) => (
                  <p className="text-red-500" key={errorMessage?.message}>
                    {errorMessage?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <form.Subscribe>
          {(state) => (
            <Button
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
              type="submit"
            >
              {state.isSubmitting ? "Updating..." : "Update password"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
