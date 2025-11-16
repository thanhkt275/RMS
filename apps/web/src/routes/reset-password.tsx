import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import ResetPasswordForm from "@/components/reset-password-form";

export const Route = createFileRoute("/reset-password")({
  component: RouteComponent,
});

function RouteComponent() {
  const tokenFromQuery = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("token") ?? "";
  }, []);

  return <ResetPasswordForm defaultToken={tokenFromQuery} />;
}
