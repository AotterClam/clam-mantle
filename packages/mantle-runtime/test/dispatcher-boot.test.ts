import { describe, expect, it } from "vitest";
import { InMemoryHandlerRegistry } from "../src/domain/port/HandlerRegistry.js";
import {
  BootValidationError,
  ValidateBootUseCase,
} from "../src/usecase/boot/ValidateBootUseCase.js";
import {
  makeBuiltinProcedure,
  makeHttpTrigger,
  makeLifecycleTrigger,
  makeProcedure,
  postsSchema,
} from "./fakes/manifests.js";

describe("ValidateBootUseCase", () => {
  it("passes when every Procedure handler ref is registered", () => {
    const reg = new InMemoryHandlerRegistry();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = new ValidateBootUseCase().execute({
      manifests: [makeProcedure()],
      registry: reg,
    });
    expect(result.ok).toBe(true);
  });

  it("fails with HANDLER_NOT_REGISTERED when ref is missing", () => {
    const reg = new InMemoryHandlerRegistry();
    const result = new ValidateBootUseCase().execute({
      manifests: [makeProcedure({ handlerRef: "missing" })],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("HANDLER_NOT_REGISTERED");
  });

  it("fails with TRIGGER_TARGET_PROCEDURE_UNKNOWN when target doesn't resolve", () => {
    const reg = new InMemoryHandlerRegistry();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = new ValidateBootUseCase().execute({
      manifests: [
        makeProcedure(),
        makeHttpTrigger({ procedure: "ghost", path: "/api/x" }),
      ],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("TRIGGER_TARGET_PROCEDURE_UNKNOWN");
  });

  it("fails with TRIGGER_PATH_COLLISION when two http triggers share method+path", () => {
    const reg = new InMemoryHandlerRegistry();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = new ValidateBootUseCase().execute({
      manifests: [
        makeProcedure({ name: "a", handlerRef: "echoHandler" }),
        makeProcedure({ name: "b", handlerRef: "echoHandler" }),
        makeHttpTrigger({ name: "ta", procedure: "a", path: "/api/dup" }),
        makeHttpTrigger({ name: "tb", procedure: "b", path: "/api/dup" }),
      ],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("TRIGGER_PATH_COLLISION");
  });

  it("fails with TRIGGER_PATH_INVALID when http trigger path lacks /api/ prefix", () => {
    const reg = new InMemoryHandlerRegistry();
    reg.register("echoHandler", () => ({ ok: true }));
    const result = new ValidateBootUseCase().execute({
      manifests: [
        makeProcedure(),
        makeHttpTrigger({ procedure: "echo", path: "/contact" }),
      ],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("TRIGGER_PATH_INVALID");
  });

  it("assert() throws BootValidationError on failure", () => {
    const reg = new InMemoryHandlerRegistry();
    expect(() =>
      new ValidateBootUseCase().assert({
        manifests: [makeProcedure({ handlerRef: "missing" })],
        registry: reg,
      }),
    ).toThrow(BootValidationError);
  });

  it("Schema with localized: true fails when siteLocales is empty", () => {
    const reg = new InMemoryHandlerRegistry();
    const localizedSchema = {
      ...postsSchema(),
      spec: { ...postsSchema().spec, localized: true },
    };
    const result = new ValidateBootUseCase().execute({
      manifests: [localizedSchema],
      registry: reg,
      siteLocales: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES");
  });

  it("emits LIFECYCLE_NOT_IN_V010 (runtime-pending) for lifecycle Triggers", () => {
    const reg = new InMemoryHandlerRegistry();
    reg.register("captchaCheck", () => ({ ok: true }));
    const result = new ValidateBootUseCase().execute({
      manifests: [
        postsSchema(),
        makeProcedure({ name: "captchaCheck", handlerRef: "captchaCheck" }),
        makeLifecycleTrigger({
          procedure: "captchaCheck",
          schema: "posts",
          on: ["before_create"],
          errorPolicy: "abort",
        }),
      ],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("LIFECYCLE_NOT_IN_V010");
  });

  it("emits LIFECYCLE_SCHEMA_UNKNOWN when lifecycle Trigger watches an unknown Schema", () => {
    const reg = new InMemoryHandlerRegistry();
    reg.register("captchaCheck", () => ({ ok: true }));
    const result = new ValidateBootUseCase().execute({
      manifests: [
        postsSchema(),
        makeProcedure({ name: "captchaCheck", handlerRef: "captchaCheck" }),
        makeLifecycleTrigger({
          procedure: "captchaCheck",
          schema: "ghost",
          on: ["before_create"],
        }),
      ],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("LIFECYCLE_SCHEMA_UNKNOWN");
  });

  it("emits HANDLER_BUILTIN_NOT_IN_V010 (runtime-pending) for builtin Procedures", () => {
    const reg = new InMemoryHandlerRegistry();
    const result = new ValidateBootUseCase().execute({
      manifests: [postsSchema(), makeBuiltinProcedure({ schema: "posts", op: "create" })],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("HANDLER_BUILTIN_NOT_IN_V010");
  });

  it("emits BUILTIN_HANDLER_SCHEMA_UNKNOWN when builtin targets unknown Schema", () => {
    const reg = new InMemoryHandlerRegistry();
    const result = new ValidateBootUseCase().execute({
      manifests: [postsSchema(), makeBuiltinProcedure({ schema: "ghost", op: "create" })],
      registry: reg,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("BUILTIN_HANDLER_SCHEMA_UNKNOWN");
  });
});
