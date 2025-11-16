import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useMatches,
} from "@tanstack/react-router";

import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "../index.css";

export type RouterAppContext = {
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "rms-hono",
      },
      {
        name: "description",
        content: "rms-hono is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  const matches = useMatches();
  const isFullscreen = matches.some(
    (match) =>
      match.routeId === "/view/$tournamentId/$stageId/" ||
      (match.fullPath.includes("/view/") &&
        match.fullPath.split("/").length >= 4)
  );

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {isFullscreen ? (
          <div className="h-svh">
            <Outlet />
          </div>
        ) : (
          <div className="grid h-svh grid-cols-[auto_1fr]">
            <Sidebar />
            <div className="grid min-h-0 grid-rows-[auto_1fr]">
              <Header />
              <main className="min-h-0 overflow-y-auto">
                <Outlet />
              </main>
            </div>
          </div>
        )}
        <Toaster richColors />
      </ThemeProvider>
      {/* <TanStackRouterDevtools position="bottom-left" /> */}
      <ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
    </>
  );
}
