import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Loader from "./loader";

type AnonymousSessionGateProps = {
  children: ReactNode;
};

export function AnonymousSessionGate({ children }: AnonymousSessionGateProps) {
  const { data: session, isPending } = authClient.useSession();
  const initializingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) {
      return;
    }
    if (session) {
      return;
    }
    if (initializingRef.current) {
      return;
    }
    initializingRef.current = true;
    const run = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/api/auth/sign-in/anonymous`,
          {
            method: "POST",
            credentials: "include",
          }
        );
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        authClient.$store.notify("$sessionSignal");
      } catch (err) {
        console.error("Failed to create anonymous session", err);
        setError("Không thể khởi tạo phiên ẩn danh.");
      } finally {
        initializingRef.current = false;
      }
    };
    run();
  }, [isPending, session]);

  if (isPending || (!session && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  return <>{children}</>;
}

