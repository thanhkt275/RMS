import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import Loader from "./loader";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignInForm({
  onForgotPassword,
}: {
  onForgotPassword?: () => void;
}) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      identifier: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const isEmail = value.identifier.includes("@");

      const onSuccess = () => {
        navigate({
          to: "/dashboard",
        });
        toast.success("Sign in successful");
      };

      const onError = (error: {
        error: { message?: string; statusText: string };
      }) => {
        toast.error(error.error.message || error.error.statusText);
      };

      if (isEmail) {
        await authClient.signIn.email(
          {
            email: value.identifier,
            password: value.password,
          },
          {
            onSuccess,
            onError,
          }
        );
      } else {
        await authClient.signIn.username(
          {
            username: value.identifier,
            password: value.password,
          },
          {
            onSuccess,
            onError,
          }
        );
      }
    },
    validators: {
      onSubmit: z.object({
        identifier: z.string().min(1, "Username or email is required"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center font-bold text-3xl">Sign In</h1>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field name="identifier">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Username or Email</Label>
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
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Password</Label>
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
        </form.Field>

        <form.Subscribe>
          {(state) => (
            <Button
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
              type="submit"
            >
              {state.isSubmitting ? "Submitting..." : "Sign In"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        {onForgotPassword && (
          <Button
            className="text-indigo-600 hover:text-indigo-800"
            onClick={onForgotPassword}
            variant="link"
          >
            Forgot password?
          </Button>
        )}
        <Button
          className="text-indigo-600 hover:text-indigo-800"
          onClick={() => navigate({ to: "/sign-up" })}
          variant="link"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
