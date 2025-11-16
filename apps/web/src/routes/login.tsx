import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    redirect({
      to: "/sign-in",
      throw: true,
    });
  },
});
