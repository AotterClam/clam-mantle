import * as React from "react";
import { Boxes } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import type { AdminBrand } from "./types";

interface AppTitleProps {
  brand: AdminBrand;
}

export function AppTitle({ brand }: AppTitleProps): React.ReactElement {
  const { setOpenMobile } = useSidebar();
  const href = brand.href ?? "/admin";
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          size="lg"
          className="data-[slot=sidebar-menu-button]:!p-1.5"
        >
          <a href={href} onClick={() => setOpenMobile(false)}>
            <span className="bg-primary/15 text-foreground flex aspect-square size-8 items-center justify-center rounded-lg ring-1 ring-border">
              <Boxes className="size-4" aria-hidden />
            </span>
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-semibold">{brand.title}</span>
              {brand.subtitle && (
                <span className="truncate text-xs text-muted-foreground">
                  {brand.subtitle}
                </span>
              )}
            </div>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
