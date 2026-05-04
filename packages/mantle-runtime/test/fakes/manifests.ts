import type {
  ProcedureManifest,
  SchemaManifest,
  TriggerManifest,
  ViewManifest,
} from "@aotter/mantle-spec";

/**
 * Hand-built manifests for tests. Mirrors the shape `parseManifests`
 * would produce; lets tests assemble Schemas / Procedures / Triggers
 * / Views without parsing YAML.
 */
export function postsSchema(): SchemaManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "Schema",
    metadata: { name: "posts" },
    spec: {
      title: "Posts",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          slug: { type: "string" },
          content: { type: "string" },
        },
        required: ["title"],
      },
      lifecycle: "simple",
    },
  };
}

export function recentPostsView(): ViewManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "View",
    metadata: { name: "recent-posts" },
    spec: {
      from: "posts",
      filter: { eq: { field: "status", value: "published" } },
      orderBy: [{ field: "updatedAt", direction: "desc" }],
      limit: 10,
    },
  };
}

export interface ProcedureOpts {
  readonly name?: string;
  readonly handlerRef?: string;
  readonly input?: SchemaManifest["spec"]["schema"];
  readonly output?: SchemaManifest["spec"]["schema"];
  readonly authPredicates?: ProcedureManifest["spec"]["requires"]["auth"]["all"] extends infer A
    ? A
    : never;
}

export function makeProcedure(opts: ProcedureOpts = {}): ProcedureManifest {
  const proc: ProcedureManifest = {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "Procedure",
    metadata: { name: opts.name ?? "echo" },
    spec: {
      input: opts.input ?? {
        type: "object",
        properties: { msg: { type: "string" } },
        required: ["msg"],
      },
      output: opts.output ?? {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
      },
      handler: { kind: "ref", ref: opts.handlerRef ?? "echoHandler" },
    },
  };
  if (opts.authPredicates) {
    return {
      ...proc,
      spec: { ...proc.spec, requires: { auth: { all: opts.authPredicates } } },
    };
  }
  return proc;
}

export function makeHttpTrigger(opts: {
  readonly name?: string;
  readonly procedure: string;
  readonly path?: string;
  readonly method?: "POST" | "PUT" | "PATCH" | "DELETE";
}): TriggerManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "Trigger",
    metadata: { name: opts.name ?? `${opts.procedure}-trigger` },
    spec: {
      source: {
        kind: "http",
        method: opts.method ?? "POST",
        path: opts.path ?? `/api/${opts.procedure}`,
      },
      target: { procedure: opts.procedure },
    },
  };
}
