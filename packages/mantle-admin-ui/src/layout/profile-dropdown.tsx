import * as React from "react";
import { useEffect, useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../lib/utils";

/**
 * Compact avatar-only profile dropdown for the top-right of the
 * Header. Mirrors satnaing's `<ProfileDropdown>` shape — the larger
 * NavUser in the sidebar footer carries the full identity card; this
 * one is the always-visible escape hatch for theme switch + sign-out.
 *
 * The Avatar / ThemeRadio / signOut helpers are duplicated with
 * NavUser by design at v0.1 — neither file is large, and the two
 * components have different ergonomic constraints (size, alignment).
 * Dedupe into a shared `lib/profile` if a third caller appears.
 */
export interface ProfileDropdownProps {
  login: string | null;
  role: "owner" | "editor" | "contributor" | null;
}

export function ProfileDropdown({
  login,
  role,
}: ProfileDropdownProps): React.ReactElement {
  const initial = (login ?? "?").charAt(0).toUpperCase();
  const avatarUrl = login
    ? `https://github.com/${encodeURIComponent(login)}.png?size=80`
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "relative inline-flex size-8 items-center justify-center rounded-full",
          "outline-hidden ring-1 ring-border",
          "hover:ring-primary/40 transition-all",
          "data-[state=open]:ring-primary",
        )}
      >
        <Avatar avatarUrl={avatarUrl} initial={initial} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2">
          <Avatar avatarUrl={avatarUrl} initial={initial} large />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {login ?? "—"}
            </span>
            <span className="label-eyebrow truncate">
              {role ?? "Signed in"}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="label-eyebrow opacity-70">
          Appearance
        </DropdownMenuLabel>
        <ThemeRadio />

        <DropdownMenuSeparator />

        <DropdownMenuItem
          asChild
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <button
            type="button"
            onClick={signOut}
            className="flex w-full cursor-pointer items-center gap-2"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({
  avatarUrl,
  initial,
  large = false,
}: {
  avatarUrl: string | null;
  initial: string;
  large?: boolean;
}): React.ReactElement {
  const size = large ? "size-9" : "size-8";
  const text = large ? "text-sm" : "text-xs";
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center justify-center rounded-full overflow-hidden",
        "bg-primary/15 text-foreground/80",
        size,
      )}
      aria-hidden
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          decoding="async"
        />
      ) : (
        <span className={cn("font-medium", text)}>{initial}</span>
      )}
    </span>
  );
}

const THEME_STORAGE_KEY = "cms.theme";
type Theme = "light" | "dark";

function ThemeRadio(): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore: private mode / disabled storage */
    }
  }, [theme]);

  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(v) => setTheme(v as Theme)}
    >
      <DropdownMenuRadioItem value="light">
        <span className="flex items-center gap-2">
          <Sun className="size-4" aria-hidden />
          Light
        </span>
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark">
        <span className="flex items-center gap-2">
          <Moon className="size-4" aria-hidden />
          Dark
        </span>
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}

function readInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function signOut(): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/admin/logout";
  document.body.appendChild(form);
  form.submit();
}
