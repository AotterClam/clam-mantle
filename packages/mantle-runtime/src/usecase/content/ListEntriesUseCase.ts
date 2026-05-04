import {
  DiagnosticError,
  type SchemaManifest,
} from "@aotter/mantle-spec";
import type { EntryRow } from "../../domain/model/EntryRow.js";
import type { EntryRepository } from "../../domain/port/EntryRepository.js";
import type { ListEntriesRequest } from "../dto/content/index.js";
import { schemaUnknownDiagnostic } from "./diagnostics.js";

/**
 * `ListEntriesUseCase` — list entries in a collection, optionally
 * filtered by status. Asserts the collection is a declared Schema.
 *
 * Caller-supplied `limit` is clamped at this layer (the trust
 * boundary between MCP / admin transports and the chokepoint
 * `EntryRepository`) — same defaults as `ViewSqlCompiler.clampLimit`.
 */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export class ListEntriesUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly schemas: ReadonlyMap<string, SchemaManifest>,
  ) {}

  async execute(request: ListEntriesRequest): Promise<readonly EntryRow[]> {
    const opPath = `usecase/ListEntries/${request.collection}`;
    if (!this.schemas.has(request.collection)) {
      throw new DiagnosticError(
        schemaUnknownDiagnostic(opPath, request.collection, [...this.schemas.keys()]),
      );
    }
    return this.entries.list({
      collection: request.collection,
      status: request.status,
      limit: clampLimit(request.limit),
    });
  }
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}
