import { Link } from "@tanstack/react-router";
import {
  Activity,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  ACCESS_RULES,
  type AccessControlUser,
  type AccessRule,
  meetsAccessRule,
} from "@/utils/access-control";

type SidebarLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  access?: AccessRule;
};

const NAV_LINKS: readonly SidebarLink[] = [
  { to: "/", label: "Home", icon: Home },
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    access: ACCESS_RULES.adminOnly,
  },
  { to: "/teams", label: "Teams", icon: Users },
  {
    to: "/score-profiles",
    label: "Score profiles",
    icon: Sparkles,
    access: ACCESS_RULES.adminOnly,
  },
  { to: "/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/results", label: "Results", icon: Activity },
] as const;

export default function Sidebar() {
  const { data: session } = authClient.useSession();
  const user = session?.user as AccessControlUser | undefined;
  const visibleLinks = NAV_LINKS.filter((link) =>
    meetsAccessRule(user, link.access)
  );

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <h1 className="font-bold text-xl">RMS</h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        {visibleLinks.map(({ to, label, icon: Icon }) => (
          <Link
            activeProps={{
              className: "bg-accent font-medium text-foreground",
            }}
            className="rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground"
            key={to}
            to={to}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </div>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
