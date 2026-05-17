import type { ViewManifest } from "@aotterclam/mantle-spec";
import type { HandlerContext } from "../../../domain/model/HandlerContext.js";
import type { CompileViewOptions } from "../../../domain/service/ViewSqlCompiler.js";

export interface ExecuteViewRequest {
  readonly view: ViewManifest;
  readonly pathPrefix?: string;
  readonly options?: CompileViewOptions;
  /** Caller identity for `requires.auth.all` evaluation. Required when
   *  `view.spec.requires` is present; the use case returns
   *  `UNAUTHENTICATED` if missing. Adapters constructing public
   *  (unauthenticated) Views may pass a guest context
   *  (`{ user: null, staff: null, ... }`) — predicate evaluation will
   *  fail closed on any `ctx.user` / `ctx.staff` requirement. */
  readonly ctx?: HandlerContext;
}
