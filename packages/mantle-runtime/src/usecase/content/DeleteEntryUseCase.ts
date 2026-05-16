import { DiagnosticError } from "@aotterclam/mantle-spec";
import type { EntryRepository } from "../../domain/port/EntryRepository.js";
import type {
  DeleteEntryRequest,
  DeleteEntryResponse,
} from "../dto/content/index.js";
import { notFoundDiagnostic } from "./diagnostics.js";

/**
 * `DeleteEntryUseCase` — permanently delete an entry + cascade
 * revisions / approvals. Distinct from `Archive` — archive is a
 * status flip, delete removes rows.
 *
 * The chokepoint enforces the cascade via `DatabaseDriver.batch`. We
 * still read the row first so missing ids surface as a structured
 * `NOT_FOUND` (matching every other content-op use case) instead of
 * a silent `{ removed: false }` — callers building UIs need the
 * diagnostic to distinguish "you deleted nothing" from "you tried to
 * delete a ghost."
 */
export class DeleteEntryUseCase {
  constructor(private readonly entries: EntryRepository) {}

  async execute(request: DeleteEntryRequest): Promise<DeleteEntryResponse> {
    const opPath = `usecase/DeleteEntry/${request.id}`;
    const existing = await this.entries.get(request.id);
    if (!existing) {
      throw new DiagnosticError(notFoundDiagnostic(opPath, "<unknown>", request.id));
    }
    return this.entries.delete({
      id: request.id,
      collection: existing.collection,
      hookContext: request.ctx,
      originalInput: request.originalInput,
    });
  }
}
