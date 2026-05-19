import { describe, expect, it, beforeEach } from "vitest";
import { runtimeDiagnostic } from "@aotter/mantle-spec";
import type { HandlerContext } from "../src/domain/model/HandlerContext.js";
import { InMemoryHandlerRegistry } from "../src/domain/port/HandlerRegistry.js";
import {
  InvokeFailure,
  InvokeProcedureUseCase,
} from "../src/usecase/procedure/InvokeProcedureUseCase.js";
import { makeBuiltinProcedure, makeProcedure } from "./fakes/manifests.js";

const anonCtx: HandlerContext = { user: null, staff: null, env: {} };

function fresh(): { reg: InMemoryHandlerRegistry; uc: InvokeProcedureUseCase } {
  const reg = new InMemoryHandlerRegistry();
  return { reg, uc: new InvokeProcedureUseCase(reg) };
}

beforeEach(() => {
  // Each test constructs its own use case so caches are naturally isolated.
});

describe("InvokeProcedureUseCase", () => {
  it("happy path: input validates, handler runs, output validates", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = await uc.execute({
      procedure: makeProcedure(),
      input: { msg: "hi" },
      ctx: anonCtx,
    });
    expect(result).toEqual({ ok: true, data: { ok: true } });
  });

  it("INPUT_VALIDATION_FAILED when input doesn't match schema", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = await uc.execute({
      procedure: makeProcedure(),
      input: { msg: 42 },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("INPUT_VALIDATION_FAILED");
    expect(result.diagnostic.path).toMatch(/^manifest:Procedure\/echo#\/input/);
  });

  it("HANDLER_NOT_REGISTERED when ref isn't in registry", async () => {
    const { uc } = fresh();
    const result = await uc.execute({
      procedure: makeProcedure({ handlerRef: "missing" }),
      input: { msg: "hi" },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("HANDLER_NOT_REGISTERED");
    expect(result.diagnostic.value).toBe("missing");
  });

  it("OUTPUT_VALIDATION_FAILED when handler returns wrong shape", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => ({ ok: "yes" }));
    const result = await uc.execute({
      procedure: makeProcedure(),
      input: { msg: "hi" },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("OUTPUT_VALIDATION_FAILED");
  });

  it("INTERNAL_ERROR when handler throws an unstructured Error", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => {
      throw new Error("boom");
    });
    const result = await uc.execute({
      procedure: makeProcedure(),
      input: { msg: "hi" },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("INTERNAL_ERROR");
    expect(result.diagnostic.message).toContain("boom");
  });

  it("InvokeFailure unwrap preserves the structured diagnostic", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => {
      throw new InvokeFailure(
        runtimeDiagnostic({
          code: "CONFLICT",
          severity: "error",
          path: "test",
          message: "specific reason",
        }),
      );
    });
    const result = await uc.execute({
      procedure: makeProcedure(),
      input: { msg: "hi" },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("CONFLICT");
    expect(result.diagnostic.message).toBe("specific reason");
  });

  it("AUTH_DENIED when ctx.user predicate fails for anonymous caller", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = await uc.execute({
      procedure: makeProcedure({ authPredicates: ["ctx.user"] }),
      input: { msg: "hi" },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("AUTH_DENIED");
  });

  it("ctx.staff role list passes when staff role is in the list", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = await uc.execute({
      procedure: makeProcedure({
        authPredicates: [{ "ctx.staff": ["editor", "owner"] }],
      }),
      input: { msg: "hi" },
      ctx: { user: { id: "u1" }, staff: { id: "u1", role: "editor" }, env: {} },
    });
    expect(result.ok).toBe(true);
  });

  it("ctx.staff role list rejects when staff role is not in the list", async () => {
    const { reg, uc } = fresh();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = await uc.execute({
      procedure: makeProcedure({
        authPredicates: [{ "ctx.staff": ["editor", "owner"] }],
      }),
      input: { msg: "hi" },
      ctx: { user: { id: "u1" }, staff: { id: "u1", role: "contributor" }, env: {} },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("AUTH_DENIED");
  });

  it("HANDLER_BUILTIN_NOT_IN_V010 if a builtin Procedure reaches Invoke (boot guard bypass)", async () => {
    const { uc } = fresh();
    const result = await uc.execute({
      procedure: makeBuiltinProcedure({ schema: "posts", op: "create" }),
      input: { data: {} },
      ctx: anonCtx,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("HANDLER_BUILTIN_NOT_IN_V010");
  });
});
