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

export function makeLifecycleTrigger(opts: {
  readonly name?: string;
  readonly procedure: string;
  readonly schema?: string;
  readonly on?: ReadonlyArray<
    | "before_create"
    | "after_create"
    | "before_update"
    | "after_update"
    | "before_delete"
    | "after_delete"
    | "before_publish"
    | "after_publish"
  >;
  readonly errorPolicy?: "abort" | "continue";
}): TriggerManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "Trigger",
    metadata: { name: opts.name ?? `${opts.procedure}-${(opts.on?.[0] ?? "lifecycle")}-trigger` },
    spec: {
      source: {
        kind: "lifecycle",
        schema: opts.schema ?? "posts",
        on: opts.on ?? ["before_create"],
        ...(opts.errorPolicy ? { errorPolicy: opts.errorPolicy } : {}),
      },
      target: { procedure: opts.procedure },
    },
  };
}

export function makeBuiltinProcedure(opts: {
  readonly name?: string;
  readonly schema?: string;
  readonly op?: "create" | "update" | "upsert" | "delete";
}): ProcedureManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "Procedure",
    metadata: { name: opts.name ?? "create-post" },
    spec: {
      input: {
        type: "object",
        properties: { data: { type: "object" } },
      },
      output: { type: "object" },
      handler: {
        kind: "builtin",
        op: opts.op ?? "create",
        schema: opts.schema ?? "posts",
      },
    },
  };
}
