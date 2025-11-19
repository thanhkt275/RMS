import type { AuthUser, auth } from "@rms-modern/auth";
import {
  inferAdditionalFields,
  usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient<typeof auth>({
  baseURL: import.meta.env.VITE_SERVER_URL,
  plugins: [inferAdditionalFields<typeof auth>(), usernameClient()],
});

// Type augmentation for better-auth client
declare module "better-auth/react" {
  interface User extends AuthUser {}
}
