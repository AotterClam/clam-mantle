import * as React from "react";

export function NotFoundView({
  path,
  intent = "missing",
}: {
  path: string;
  intent?: "missing" | "planned";
}): React.ReactElement {
  return (
    <div className="glass-card animate-rise mx-auto max-w-md p-8 text-center">
      <h1 className="mb-2 text-xl">
        {intent === "planned" ? "Not wired yet" : "Not found"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {intent === "planned"
          ? "This admin surface is reserved, but v0.1 focuses on owner bootstrap and MCP operation."
          : "No view registered for"}{" "}
        <code className="font-mono text-xs">{path}</code>.
      </p>
      <p className="mt-4 text-sm">
        <a href="/admin" className="text-primary hover:underline">
          Back to home
        </a>
      </p>
    </div>
  );
}
