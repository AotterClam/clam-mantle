import * as React from "react";
import { useEffect, useState } from "react";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "./lib/utils";

export interface ProfileMenuProps {
  login: string | null;
  role: "owner" | "editor" | "contributor" | null;
}

/**
 * Account dropdown — top-right avatar in the admin header. Trigger
 * shows the avatar + GitHub login on lg+; menu surfaces the theme
 * toggle and a sign-out form.
 *
 * Sign-out is a synthetic `<form method="POST" action="/admin/logout">`
 * submission so it works without JS too — the cookie clear / redirect
 * happens server-side.
 */
export function ProfileMenu({
  login,
  role,
}: ProfileMenuProps): React.ReactElement {
  const initial = (login ?? "?").charAt(0).toUpperCase();
  const avatarUrl = login
    ? `https://github.com/${encodeURIComponent(login)}.png?size=80`
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-2 rounded-full p-1 outline-hidden",
          "hover:bg-accent/40 transition-colors",
          "data-[state=open]:bg-accent/60",
        )}
      >
        <Avatar avatarUrl={avatarUrl} initial={initial} />
        {login && (
          <span className="hidden lg:inline-flex items-center gap-1 pr-1 text-sm text-foreground">
            <span className="max-w-[10rem] truncate">{login}</span>
            <ChevronDown
              className="size-3.5 text-muted-foreground"
              aria-hidden
            />
          </span>
        )}
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
            className="w-full cursor-pointer flex items-center gap-2"
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
  const size = large ? "size-9" : "size-7";
  const text = large ? "text-sm" : "text-xs";
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center justify-center rounded-full",
        "bg-primary/20 text-foreground/80 ring-1 ring-border",
        size,
      )}
      aria-hidden
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full rounded-full object-cover"
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
      /* private mode / disabled storage — fine to ignore */
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
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function signOut(): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/admin/logout";
  document.body.appendChild(form);
  form.submit();
}
