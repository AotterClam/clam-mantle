import * as React from "react";

export type SidebarVariant = "inset" | "sidebar" | "floating";

const VARIANT_COOKIE = "layout_variant";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

// `inset` looks great against a light/neutral body background (satnaing's
// demo). Our admin SPA paints a dark `--app-bg` gradient on body, which
// turns the `m-2` gap around the inset main into an unwanted dark border.
// `sidebar` is the flush variant — sidebar + main share the viewport with
// no outer margin. Switch back to `inset` once we either lighten the body
// bg or expose a UI toggle that lets the operator pick.
const DEFAULT_VARIANT: SidebarVariant = "sidebar";

interface LayoutContextValue {
  variant: SidebarVariant;
  setVariant: (v: SidebarVariant) => void;
  defaultVariant: SidebarVariant;
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

export function LayoutProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [variant, setVariantState] = React.useState<SidebarVariant>(readVariant);

  const setVariant = React.useCallback((v: SidebarVariant) => {
    writeCookie(VARIANT_COOKIE, v);
    setVariantState(v);
  }, []);

  const value = React.useMemo<LayoutContextValue>(
    () => ({
      variant,
      setVariant,
      defaultVariant: DEFAULT_VARIANT,
    }),
    [variant, setVariant],
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
