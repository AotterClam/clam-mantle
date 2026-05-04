import { DiagnosticError } from "@aotter/mantle-spec";
import type { EntryRow } from "../../domain/model/EntryRow.js";
import type { Clock } from "../../domain/port/Clock.js";
import type { EntryRepository } from "../../domain/port/EntryRepository.js";
import type { UnpublishRequest } from "../dto/content/index.js";
import {
  illegalTransitionDiagnostic,
  notFoundDiagnostic,
  withConflictDiagnostic,
} from "./diagnostics.js";

/**
 * `UnpublishUseCase` — flip published / archived rows back to
 * `'draft'`. Used by the admin SPA's "edit a published entry" flow.
 */
export class UnpublishUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: UnpublishRequest): Promise<EntryRow> {
    const opPath = `usecase/Unpublish/${request.id}`;
    const existing = await this.entries.get(request.id);
    if (!existing) {
      throw new DiagnosticError(notFoundDiagnostic(opPath, "<unknown>", request.id));
    }
    if (existing.status !== "published" && existing.status !== "archived") {
      throw new DiagnosticError(
        illegalTransitionDiagnostic(opPath, existing.status, "draft"),
      );
    }
    return withConflictDiagnostic(opPath, () =>
      this.entries.transitionStatus({
        id: request.id,
        to: "draft",
        expectedStatus: existing.status,
        now: this.clock.now(),
      }),
    );
  }
}
