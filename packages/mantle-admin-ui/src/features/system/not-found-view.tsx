import * as React from "react";
import { usePreferences } from "../../app/preferences";
import { t } from "../../app/i18n";

export function NotFoundView({
  path,
  intent = "missing",
  kind = "route",
}: {
  path: string;
  intent?: "missing" | "planned";
  kind?: "route" | "settings";
}): React.ReactElement {
  const { language } = usePreferences();
  const isSettings = intent === "planned" && kind === "settings";

  return (
    <div className="glass-card animate-rise mx-auto max-w-md p-8 text-center">
      <h1 className="mb-2 text-xl">
        {isSettings
          ? t(language, "settings.planned.title")
          : intent === "planned"
            ? t(language, "system.notFound.plannedTitle")
            : t(language, "system.notFound.title")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {isSettings ? (
          t(language, "settings.planned.body")
        ) : (
          <>
            {t(language, "system.notFound.body")}{" "}
            <code className="font-mono text-xs">{path}</code>.
          </>
        )}
      </p>
      <p className="mt-4 text-sm">
        <a href="/admin" className="text-primary hover:underline">
          {t(language, "system.notFound.back")}
        </a>
      </p>
    </div>
  );
}
