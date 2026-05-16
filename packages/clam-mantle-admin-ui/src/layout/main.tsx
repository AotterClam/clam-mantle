import * as React from "react";
import { cn } from "../lib/utils";
import { MAIN_CONTENT_ID } from "./skip-to-main";

interface MainProps {
  fixed?: boolean;
  fluid?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Main({
  fixed = false,
  fluid = false,
  className,
  children,
}: MainProps): React.ReactElement {
  return (
    <div
      id={MAIN_CONTENT_ID}
      data-layout={fixed ? "fixed" : "auto"}
      className={cn(
        "@container/content",
        "px-4 py-6 sm:px-6",
        fixed && "flex grow flex-col overflow-hidden",
        !fluid && "@7xl/content:mx-auto @7xl/content:max-w-7xl",
        "flex-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
