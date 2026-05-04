import {
  httpStatusFor,
  redactForWire,
  runtimeDiagnostic,
  type Diagnostic,
} from "@aotterclam/clam-cms-spec";

export function jsonRpcOk(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json" },
  });
}

export function jsonRpcOkRaw(id: unknown, resultJson: string): Response {
  const idJson = JSON.stringify(id);
  return new Response(`{"jsonrpc":"2.0","id":${idJson},"result":${resultJson}}`, {
    headers: { "content-type": "application/json" },
  });
}

export function jsonRpcError(id: unknown, code: number, message: string, data?: unknown): Response {
  const error: { code: number; message: string; data?: unknown } = { code, message };
  if (data !== undefined) error.data = data;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), {
    headers: { "content-type": "application/json" },
  });
}

/**
 * Build a JSON-RPC error `Response` carrying a structured Diagnostic.
 * Used by transport adapters at the layer outside the dispatcher for
 * HTTP-level rejections (missing bearer token, non-staff caller) that
 * never enter the JSON-RPC dispatcher's own catch path.
 */
export function mcpJsonRpcError(diagnostic: Diagnostic, requestId: unknown = null): Response {
  const redacted = redactForWire(diagnostic);
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: requestId,
    error: { code: -32000, message: redacted.message, data: redacted },
  });
  return new Response(body, {
    status: httpStatusFor(diagnostic),
    headers: { "content-type": "application/json" },
  });
}

/** Helper to construct an "unauthenticated" MCP error response. */
export function mcpUnauthenticated(message: string): Response {
  return mcpJsonRpcError(
    runtimeDiagnostic({
      code: "UNAUTHENTICATED",
      severity: "error",
      path: "mcp:fetch",
      expected: "valid bearer token",
      message,
    }),
  );
}
