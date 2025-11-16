import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/verify-email")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
});

function RouteComponent() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setError("Verification token is missing");
        setIsVerifying(false);
        return;
      }

      try {
        await authClient.verifyEmail({
          query: { token },
        });

        toast.success("Email verified successfully! You can now sign in.");
        setTimeout(() => {
          navigate({ to: "/sign-in" });
        }, 2000);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Email verification failed";
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsVerifying(false);
      }
    };

    verifyEmail();
  }, [token, navigate]);

  if (isVerifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader />
        <p className="mt-4 text-muted-foreground">Verifying your email...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="font-bold text-3xl text-destructive">
              Verification Failed
            </h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/sign-in" })}
            >
              Go to Sign In
            </Button>
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/sign-up" })}
              variant="outline"
            >
              Create New Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-bold text-3xl text-green-600">Email Verified!</h1>
          <p className="text-muted-foreground">
            Your email has been successfully verified. Redirecting to sign in...
          </p>
        </div>
      </div>
    </div>
  );
}
