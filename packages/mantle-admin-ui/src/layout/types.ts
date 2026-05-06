import type { ElementType } from "react";

export interface NavLink {
  readonly title: string;
  readonly url: string;
  readonly icon?: ElementType;
  readonly badge?: string;
  readonly external?: boolean;
}

export interface NavCollapsible {
  readonly title: string;
  readonly icon?: ElementType;
  readonly badge?: string;
  readonly items: ReadonlyArray<NavLink>;
}

export type NavItem = NavLink | NavCollapsible;

export function isCollapsible(item: NavItem): item is NavCollapsible {
  return Array.isArray((item as NavCollapsible).items);
}

export interface NavGroupData {
  readonly title?: string;
  readonly items: ReadonlyArray<NavItem>;
}

export interface AdminBrand {
  readonly title: string;
  readonly subtitle?: string;
  readonly href?: string;
}
