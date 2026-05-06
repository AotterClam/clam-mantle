import * as React from "react";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";
import { cn } from "../lib/utils";

interface HeaderProps {
  fixed?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Header({
  fixed = false,
  className,
  children,
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
      <Separator orientation="vertical" className="me-2 h-4 md:hidden" />
      {children}
    </header>
  );
}
