/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";

export interface FooterProps {
  readonly site: SiteConfig;
  readonly locale: string;
}

/** Default site footer. Override via `theme/index.ts:components.Footer`. */
export function Footer(props: FooterProps) {
  const { site } = props;
  return (
    <footer class="site-footer">
      <div class="colophon">
        {site.brand} · {site.description ?? ""}
      </div>
      <div>
        built on{" "}
        <a href="https://github.com/AotterClam/clam-cms">clam·cms</a>
      </div>
    </footer>
  );
}
