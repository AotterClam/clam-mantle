import * as React from "react";
import { useEffect, useState } from "react";
import {
  ChevronsUpDown,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { cn } from "../lib/utils";

export interface NavUserProps {
  login: string | null;
  role: "owner" | "editor" | "contributor" | null;
}

export function NavUser({ login, role }: NavUserProps): React.ReactElement {
  const { isMobile } = useSidebar();
  const initial = (login ?? "?").charAt(0).toUpperCase();
  const avatarUrl = login
    ? `https://github.com/${encodeURIComponent(login)}.png?size=80`
    : null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-accent/40"
            >
              <Avatar avatarUrl={avatarUrl} initial={initial} />
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{login ?? "—"}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {role ?? "Signed in"}
                </span>
              </div>
              <ChevronsUpDown
                className="ms-auto size-4 text-muted-foreground"
                aria-hidden
              />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side={isMobile ? "bottom" : "right"}
            sideOffset={6}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          >
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
      </SidebarMenuItem>
    </SidebarMenu>
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
        "shrink-0 inline-flex items-center justify-center rounded-lg",
        "bg-primary/15 text-foreground/80 ring-1 ring-border",
        size,
      )}
      aria-hidden
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full rounded-lg object-cover"
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
