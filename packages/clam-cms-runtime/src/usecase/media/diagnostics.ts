import { makeDiagnostic, type Diagnostic } from "@aotterclam/clam-cms-spec";

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
