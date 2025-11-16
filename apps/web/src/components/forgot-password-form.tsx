import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type ForgotPasswordFormProps = {
  onBackToSignIn: () => void;
};

export default function ForgotPasswordForm({
  onBackToSignIn,
}: ForgotPasswordFormProps) {
  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const resetUrl =
          typeof window === "undefined"
            ? ""
            : `${window.location.origin}/reset-password`;

        await authClient.$fetch("/request-password-reset", {
          method: "POST",
          body: {
            email: value.email,
            redirectTo: resetUrl,
          },
        });

        toast.success("Password reset link sent. Please check your email.");
        onBackToSignIn();
      } catch (error) {
        if (error instanceof Error) {
          toast.error(error.message);
          return;
        }
        toast.error("Unable to process your request right now.");
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
      }),
    },
  });

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-2 text-center font-bold text-3xl">Reset Password</h1>
      <p className="mb-6 text-center text-muted-foreground text-sm">
        Enter the email associated with your account and we&apos;ll email you a
        reset link.
      </p>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div>
          <form.Field name="email">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type="email"
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
              {state.isSubmitting ? "Sending link..." : "Send reset link"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button onClick={onBackToSignIn} variant="link">
          Back to sign in
        </Button>
      </div>
    </div>
  );
}
