import { makeDiagnostic, type Diagnostic } from "@aotter/mantle-spec";

const PHASE = "runtime" as const;

export function mediaNotConfiguredDiagnostic(opPath: string): Diagnostic {
  return makeDiagnostic({
    code: "MEDIA_NOT_CONFIGURED",
    phase: PHASE,
    severity: "error",
    path: opPath,
    expected: "media storage adapter bound at runtime",
    message:
      "Media uploads are not enabled on this deployment. Bind a `mediaStorage` adapter in `createCmsRuntime` to enable.",
  });
}

export function mediaMimeRejectedDiagnostic(opPath: string, mime: string): Diagnostic {
  return makeDiagnostic({
    code: "MEDIA_MIME_REJECTED",
    phase: PHASE,
    severity: "error",
    path: opPath,
    value: mime,
    expected: "one of: image/png, image/jpeg, image/webp, image/gif",
  });
}

export function mediaSvgRejectedDiagnostic(opPath: string): Diagnostic {
  return makeDiagnostic({
    code: "MEDIA_SVG_REJECTED",
    phase: PHASE,
    severity: "error",
    path: opPath,
    value: "image/svg+xml",
    expected: "non-SVG image (object storage does not sanitize SVG payloads)",
    suggestion: "set MEDIA_ALLOW_SVG=1 on the adapter if SVG is required",
  });
}

export function mediaSizeExceededDiagnostic(
  opPath: string,
  byteSize: number,
  maxBytes: number,
): Diagnostic {
  return makeDiagnostic({
    code: "MEDIA_SIZE_EXCEEDED",
    phase: PHASE,
    severity: "error",
    path: opPath,
    value: byteSize,
    expected: `byteSize <= ${maxBytes}`,
  });
}

export function mediaUploadExpiredDiagnostic(opPath: string, uploadId: string): Diagnostic {
  return makeDiagnostic({
    code: "MEDIA_UPLOAD_EXPIRED",
    phase: PHASE,
    severity: "error",
    path: opPath,
    value: uploadId,
    expected: "an active upload capability (TTL elapsed or never created)",
    suggestion: "call create_media_upload again to get a fresh capability",
  });
}

export function mediaObjectNotFoundDiagnostic(opPath: string, uploadId: string): Diagnostic {
  return makeDiagnostic({
    code: "MEDIA_OBJECT_NOT_FOUND",
    phase: PHASE,
    severity: "error",
    path: opPath,
    value: uploadId,
    expected: "an object PUT to the storage backend before commit",
    suggestion: "PUT the file to the upload URL before calling commit_media_upload",
  });
}

/** Caller supplied a `purpose` that this deployment did not declare in
 *  `siteDefaults.media.purposes`. Fail-closed per #262: alpha has no
 *  production consumers, so there is no warn-and-allow compatibility
 *  mode — undeclared purposes are always rejected. The `expected`
 *  field carries the declared set so agents can self-correct without
 *  another round trip. */
export function mediaPurposeRejectedDiagnostic(
  opPath: string,
  purpose: string | undefined,
  declared: readonly string[],
): Diagnostic {
  const expected =
    declared.length > 0
      ? `purpose ∈ {${declared.map((p) => `'${p}'`).join(", ")}}`
      : "media uploads are not enabled on this deployment (no `media.purposes` declared in siteDefaults)";
  return makeDiagnostic({
    code: "MEDIA_PURPOSE_REJECTED",
    phase: PHASE,
    severity: "error",
    path: opPath,
    value: purpose ?? "(missing)",
    expected,
    suggestion:
      declared.length > 0
        ? "pass one of the declared purposes; starters own the taxonomy"
        : "add `media.purposes` to `siteDefaults` in mantleConfig.ts to enable uploads",
  });
}
