/**
 * Shared JSON-RPC client for the integration smokes (mcp-smoke.ts,
 * media-smoke.ts). Authenticates with the fixture-minted Better Auth
 * MCP access token. Each smoke imports `makeMcpClient(baseUrl)` and
 * uses the returned `rpc` / `tool` / `toolErr` triple.
 */
import { FIXTURE_MCP_ACCESS_TOKEN } from "../fixture/data.js";

export interface JsonRpcResult {
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export interface ToolCallEnvelope {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text: string }>;
}

export interface McpClient {
  rpc(method: string, params?: unknown): Promise<JsonRpcResult>;
  tool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
  toolErr(name: string, args: Record<string, unknown>): Promise<{
    readonly code: number;
    readonly message: string;
    readonly data?: { readonly code?: string };
  }>;
}

export function makeMcpClient(baseUrl: string, path = "/staff/mcp"): McpClient {
  const bearer = `Bearer ${FIXTURE_MCP_ACCESS_TOKEN}`;
  let rpcId = 1;

  const rpc: McpClient["rpc"] = async (method, params) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: bearer },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
    });
    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as JsonRpcResult;
  };

  const tool: McpClient["tool"] = async (name, args) => {
    const r = await rpc("tools/call", { name, arguments: args });
    if (r.error) throw new Error(`MCP tool '${name}' failed: ${r.error.message}`);
    const env = r.result as ToolCallEnvelope;
    const text = env.content[0]?.text ?? "null";
    return JSON.parse(text);
  };

  const toolErr: McpClient["toolErr"] = async (name, args) => {
    const r = await rpc("tools/call", { name, arguments: args });
    if (!r.error) {
      throw new Error(
        `expected tool '${name}' to fail; got result: ${JSON.stringify(r.result)}`,
      );
    }
    return r.error as {
      code: number;
      message: string;
      data?: { code?: string };
    };
  };

  return { rpc, tool, toolErr };
}
