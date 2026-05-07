import * as React from "react";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";
import { ProfileDropdown } from "./profile-dropdown";
import { cn } from "../lib/utils";
import {
  LanguagePreferenceDropdown,
  ThemePreferenceDropdown,
} from "./preference-controls";

interface HeaderProps {
  fixed?: boolean;
  className?: string;
  /** Toolbar items rendered between the sidebar trigger and the
   *  trailing ProfileDropdown — `me-auto` on the first child pushes
   *  the dropdown to the far right (mirrors satnaing's pattern of
   *  `<TopNav className="me-auto" /> <Search /> <ProfileDropdown />`). */
  children?: React.ReactNode;
  /** Identity for the trailing ProfileDropdown. `null`s render the
   *  initial-fallback avatar. */
  user?: {
    login: string | null;
    role: "owner" | "editor" | "contributor" | null;
  };
}

export function Header({
  fixed = false,
  className,
  children,
  user,
}: HeaderProps): React.ReactElement {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    if (!fixed) return;
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [fixed]);

  return (
    <header
      data-slot="header"
      data-scrolled={scrolled || undefined}
      className={cn(
        "z-20 flex h-14 shrink-0 items-center gap-2 px-4",
        fixed
          ? "sticky top-0 w-[inherit] backdrop-blur transition-shadow"
          : "border-b border-border/40",
        scrolled && "shadow-sm",
        "glass-strip",
        className,
      )}
    >
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-2 h-4" />
      {children}
      {user ? (
        // `flex items-center` on the wrapper kills the inline-flex
        // baseline descent gap — without it the wrap div is taller
        // than the trigger by ~8px (line-height carry) and the
        // avatar lands above center.
        <div
          className={cn(
            "flex items-center gap-2",
            children ? "" : "ms-auto",
          )}
        >
          <LanguagePreferenceDropdown />
          <ThemePreferenceDropdown />
          <ProfileDropdown login={user.login} role={user.role} />
        </div>
      ) : null}
    </header>
  );
}
