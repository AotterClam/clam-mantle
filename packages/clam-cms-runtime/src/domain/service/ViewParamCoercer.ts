import type { JsonSchema, ViewManifest } from "@aotterclam/clam-cms-spec";

/**
 * Coerce a public REST query string into the typed param map declared
 * by `View.spec.params`. v0.1 grammar covers scalar leaves only —
 * string / integer / number / boolean / enum. `required` is enforced;
 * unknown query keys are silently ignored (lenient v0.1.0).
 *
 * Lives in `clam-cms-runtime` (not the CF adapter) so future adapters
 * — Netlify, Bun, Deno — share one coercion path. Throws a
 * `ViewParamCoercionError` so the adapter can map the message into its
 * own diagnostic envelope without parsing prose.
 */
export class ViewParamCoercionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewParamCoercionError";
  }
}

export interface ViewParamLookup {
  get(name: string): string | null;
}

export function coerceViewParams(
  view: ViewManifest,
  query: ViewParamLookup,
): Record<string, unknown> {
  const declared = view.spec.params;
  if (!declared) return {};
  const props = declared.properties ?? {};
  const required = declared.required ?? [];
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(props) as Array<[string, JsonSchema]>) {
    const raw = query.get(name);
    if (raw == null) {
      if (required.includes(name)) {
        throw new ViewParamCoercionError(
          `View '${view.metadata.name}' requires query param '${name}' (declared in View.spec.params.required).`,
        );
      }
      continue;
    }
    out[name] = coerceScalar(raw, schema, name);
  }
  return out;
}

function coerceScalar(raw: string, schema: JsonSchema, name: string): unknown {
  const type = schema.type;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (!schema.enum.includes(raw)) {
      throw new ViewParamCoercionError(
        `query param '${name}' must be one of ${schema.enum.join(", ")}; got ${JSON.stringify(raw)}.`,
      );
    }
    return raw;
  }
  switch (type) {
    case "integer": {
      const n = Number.parseInt(raw, 10);
      // Reject "1.5", "1abc", "  1  " — only canonical decimals pass.
      if (!Number.isFinite(n) || String(n) !== raw.trim()) {
        throw new ViewParamCoercionError(
          `query param '${name}' expected integer; got ${JSON.stringify(raw)}.`,
        );
      }
      return n;
    }
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new ViewParamCoercionError(
          `query param '${name}' expected number; got ${JSON.stringify(raw)}.`,
        );
      }
      return n;
    }
    case "boolean":
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new ViewParamCoercionError(
        `query param '${name}' expected boolean (true|false); got ${JSON.stringify(raw)}.`,
      );
    case "string":
    case undefined:
      return raw;
    default:
      throw new ViewParamCoercionError(
        `View param '${name}' declares unsupported type '${String(type)}' for the public REST surface (v0.1 covers string / integer / number / boolean / enum).`,
      );
  }
}
