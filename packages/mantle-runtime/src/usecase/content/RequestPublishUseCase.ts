import {
  canTransition,
  DiagnosticError,
  publishRequiresApproval,
  resolveLifecycle,
  runtimeDiagnostic,
  type SchemaManifest,
} from "@aotter/mantle-spec";
import type { EntryRow } from "../../domain/model/EntryRow.js";
import type { Clock } from "../../domain/port/Clock.js";
import type { EntryRepository } from "../../domain/port/EntryRepository.js";
import type { RequestPublishRequest } from "../dto/content/index.js";
import {
  illegalTransitionDiagnostic,
  notFoundDiagnostic,
  withConflictDiagnostic,
} from "./diagnostics.js";

/**
 * `RequestPublishUseCase` — publish or queue-for-approval, depending
 * on the Schema's `lifecycle` mode.
 *
 * v0.1.0 ships `simple` only — request goes straight to `published`
 * with a status guard via the spec's state machine. The Schema parser
 * accepts `lifecycle: editorial` (it's a v0.1.x-committed mode in
 * `V01_LIFECYCLE_MODES`), so this use case is the only line of
 * defense: when a Schema declares `editorial`, it surfaces a
 * structured `LIFECYCLE_NOT_IN_V010` error here at request time.
 * The approvals-queue branch lands in v0.1.x.
 */
export class RequestPublishUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly schemas: ReadonlyMap<string, SchemaManifest>,
    private readonly clock: Clock,
  ) {}

  async execute(request: RequestPublishRequest): Promise<EntryRow> {
    const opPath = `usecase/RequestPublish/${request.id}`;
    const existing = await this.entries.get(request.id);
    if (!existing) {
      throw new DiagnosticError(notFoundDiagnostic(opPath, "<unknown>", request.id));
    }
    const schema = this.schemas.get(existing.collection);
    if (publishRequiresApproval(schema)) {
      throw new DiagnosticError(
        runtimeDiagnostic({
          code: "LIFECYCLE_NOT_IN_V010",
          severity: "error",
          path: opPath,
          value: resolveLifecycle(schema),
          expected: "lifecycle: 'simple' (editorial lands in v0.1.x)",
          message: `Schema '${existing.collection}' uses lifecycle: 'editorial', which is v0.1.x-committed. v0.1.0 only supports 'simple' lifecycle.`,
        }),
      );
    }

    if (!canTransition(schema, existing.status, "published")) {
      throw new DiagnosticError(
        illegalTransitionDiagnostic(opPath, existing.status, "published"),
      );
    }
    return withConflictDiagnostic(opPath, () =>
      this.entries.transitionStatus({
        id: request.id,
        to: "published",
        expectedStatus: existing.status,
        now: this.clock.now(),
        hookContext: request.ctx,
        originalInput: request.originalInput,
      }),
    );
  }
}
