import type { ContentStatus } from "../lib/types";
import { cn } from "../lib/utils";

const STATUS_CLASS: Record<ContentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-[color:var(--warning)]",
  approved: "bg-[color-mix(in_srgb,var(--success)_18%,transparent)] text-[color:var(--success)]",
  scheduled: "bg-[color-mix(in_srgb,var(--info)_18%,transparent)] text-[color:var(--info)]",
  published: "bg-[color-mix(in_srgb,var(--success)_18%,transparent)] text-[color:var(--success)]",
  archived: "bg-secondary text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}): React.ReactElement {
  const known = isContentStatus(status);
  return (
    <span
      className={cn(
        "badge-status",
        known ? STATUS_CLASS[status] : "bg-accent text-accent-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}

function isContentStatus(status: string): status is ContentStatus {
  return status in STATUS_CLASS;
}
