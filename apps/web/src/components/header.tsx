import { ModeToggle } from "./mode-toggle";
import OrgNavigationSelector from "./org-navigation-selector";
import UserMenu from "./user-menu";

export default function Header() {
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-6">
      <OrgNavigationSelector />
      <div className="flex items-center gap-4">
        <ModeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
