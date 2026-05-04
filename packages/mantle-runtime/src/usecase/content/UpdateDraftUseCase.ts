import {
  DiagnosticError,
  runtimeDiagnostic,
} from "@aotter/mantle-spec";
import type { EntryRow } from "../../domain/model/EntryRow.js";
import type { Clock } from "../../domain/port/Clock.js";
import type { EntryRepository } from "../../domain/port/EntryRepository.js";
import type { UpdateDraftRequest } from "../dto/content/index.js";
import {
  notFoundDiagnostic,
  withConflictDiagnostic,
} from "./diagnostics.js";

/**
 * `UpdateDraftUseCase` — update a draft's data. Only entries in
 * `'draft'` status are editable — `published` / `archived` go via the
 * unpublish (back to draft) path first.
 */
export class UpdateDraftUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: UpdateDraftRequest): Promise<EntryRow> {
    const opPath = `usecase/UpdateDraft/${request.id}`;
    const existing = await this.entries.get(request.id);
    if (!existing) {
      throw new DiagnosticError(notFoundDiagnostic(opPath, "<unknown>", request.id));
    }
    if (existing.status !== "draft") {
      throw new DiagnosticError(
        runtimeDiagnostic({
          code: "CONFLICT",
          severity: "error",
          path: opPath,
          value: existing.status,
          expected: "row.status === 'draft'",
          message: `Entry '${request.id}' is in status '${existing.status}'; only drafts are editable. Unpublish first.`,
        }),
      );
    }
    return withConflictDiagnostic(opPath, () =>
      this.entries.update({
        id: request.id,
        expectedVersion: request.expectedVersion,
        data: { ...existing.data, ...request.data },
        now: this.clock.now(),
      }),
    );
  }
}
