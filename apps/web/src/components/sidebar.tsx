import { Link } from "@tanstack/react-router";
import {
  Activity,
  Home,
  LayoutDashboard,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const links = [
    { to: "/", label: "Home", icon: Home },
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/teams", label: "Teams", icon: Users },
    { to: "/score-profiles", label: "Score profiles", icon: Sparkles },
    { to: "/tournaments", label: "Tournaments", icon: Trophy },
    { to: "/results", label: "Results", icon: Activity },
  ] as const;

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <h1 className="font-bold text-xl">RMS</h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        {links.map(({ to, label, icon: Icon }) => (
          <Link
            className={({ isActive }: { isActive: boolean }) =>
              cn(
                "rounded-lg px-3 py-2 text-muted-foreground transition-all hover:bg-accent hover:text-foreground",
                isActive && "bg-accent font-medium text-foreground"
              )
            }
            key={to}
            // @ts-expect-error - TanStack Router types may not include function className
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
