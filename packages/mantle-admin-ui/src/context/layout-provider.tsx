import * as React from "react";

export type SidebarVariant = "inset" | "sidebar" | "floating";
export type SidebarCollapsible = "offcanvas" | "icon" | "none";

const VARIANT_COOKIE = "layout_variant";
const COLLAPSIBLE_COOKIE = "layout_collapsible";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

// `inset` looks great against a light/neutral body background (satnaing's
// demo). Our admin SPA paints a dark `--app-bg` gradient on body, which
// turns the `m-2` gap around the inset main into an unwanted dark border.
// `sidebar` is the flush variant — sidebar + main share the viewport with
// no outer margin. Switch back to `inset` once we either lighten the body
// bg or expose a UI toggle that lets the operator pick.
const DEFAULT_VARIANT: SidebarVariant = "sidebar";
const DEFAULT_COLLAPSIBLE: SidebarCollapsible = "icon";

interface LayoutContextValue {
  variant: SidebarVariant;
  collapsible: SidebarCollapsible;
  setVariant: (v: SidebarVariant) => void;
  setCollapsible: (c: SidebarCollapsible) => void;
  resetLayout: () => void;
  defaultVariant: SidebarVariant;
  defaultCollapsible: SidebarCollapsible;
}

const LayoutContext = React.createContext<LayoutContextValue | null>(null);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]!) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function readVariant(): SidebarVariant {
  const raw = readCookie(VARIANT_COOKIE);
  return raw === "inset" || raw === "sidebar" || raw === "floating"
    ? raw
    : DEFAULT_VARIANT;
}

function readCollapsible(): SidebarCollapsible {
  const raw = readCookie(COLLAPSIBLE_COOKIE);
  return raw === "offcanvas" || raw === "icon" || raw === "none"
    ? raw
    : DEFAULT_COLLAPSIBLE;
}

export function LayoutProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [variant, setVariantState] = React.useState<SidebarVariant>(readVariant);
  const [collapsible, setCollapsibleState] =
    React.useState<SidebarCollapsible>(readCollapsible);

  const setVariant = React.useCallback((v: SidebarVariant) => {
    writeCookie(VARIANT_COOKIE, v);
    setVariantState(v);
  }, []);

  const setCollapsible = React.useCallback((c: SidebarCollapsible) => {
    writeCookie(COLLAPSIBLE_COOKIE, c);
    setCollapsibleState(c);
  }, []);

  const resetLayout = React.useCallback(() => {
    writeCookie(VARIANT_COOKIE, DEFAULT_VARIANT);
    writeCookie(COLLAPSIBLE_COOKIE, DEFAULT_COLLAPSIBLE);
    setVariantState(DEFAULT_VARIANT);
    setCollapsibleState(DEFAULT_COLLAPSIBLE);
  }, []);

  const value = React.useMemo<LayoutContextValue>(
    () => ({
      variant,
      collapsible,
      setVariant,
      setCollapsible,
      resetLayout,
      defaultVariant: DEFAULT_VARIANT,
      defaultCollapsible: DEFAULT_COLLAPSIBLE,
    }),
    [variant, collapsible, setVariant, setCollapsible, resetLayout],
  );

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

export function useLayout(): LayoutContextValue {
  const ctx = React.useContext(LayoutContext);
  if (!ctx) {
    throw new Error("useLayout must be used inside LayoutProvider");
  }
  return ctx;
}

export const SIDEBAR_OPEN_COOKIE = "sidebar_state";

export function readSidebarOpenCookie(): boolean | null {
  const raw = readCookie(SIDEBAR_OPEN_COOKIE);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

export function writeSidebarOpenCookie(open: boolean): void {
  writeCookie(SIDEBAR_OPEN_COOKIE, String(open));
}
