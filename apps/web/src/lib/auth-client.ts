import type { AuthUser, auth } from "@rms-modern/auth";
import {
  inferAdditionalFields,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const TRAILING_SLASH_REGEX = /\/+$/;

function resolveAuthBaseUrl() {
  const baseUrl = import.meta.env.VITE_SERVER_URL;
  if (!baseUrl) {
    throw new Error(
      "[auth] VITE_SERVER_URL is missing. Set it to your API origin."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("[auth] VITE_SERVER_URL must be a valid absolute URL.");
  }

  if (import.meta.env.PROD && parsed.protocol !== "https:") {
    throw new Error("[auth] VITE_SERVER_URL must use https in production.");
  }

  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(TRAILING_SLASH_REGEX, "") || "/";

  return parsed.toString();
}

export const authClient = createAuthClient<typeof auth>({
  baseURL: resolveAuthBaseUrl(),
  plugins: [inferAdditionalFields<typeof auth>(), usernameClient()],
});

// Type augmentation for better-auth client
declare module "better-auth/react" {
  interface User extends AuthUser {}
}
