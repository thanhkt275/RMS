import { createFileRoute, redirect } from "@tanstack/react-router";
import SignInForm from "@/components/sign-in-form";
import { authClient } from "@/lib/auth-client";
import {
  ACCESS_RULES,
  type AccessControlUser,
  meetsAccessRule,
} from "@/utils/access-control";

export const Route = createFileRoute("/sign-in")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    const user = session.data?.user as AccessControlUser | undefined;
    if (meetsAccessRule(user, ACCESS_RULES.registeredOnly)) {
      redirect({
        to: "/dashboard",
        throw: true,
      });
    }
  },
});

function RouteComponent() {
  return <SignInForm />;
}
