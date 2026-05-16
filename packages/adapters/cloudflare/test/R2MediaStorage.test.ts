import { describe, expect, it } from "vitest";
import { AwsClient } from "aws4fetch";
import type { IdGenerator } from "@aotterclam/clam-mantle-runtime";
import { R2MediaStorage } from "../src/bindings/R2MediaStorage.js";

/**
 * Unit-tests `R2MediaStorage` directly against a fake `R2Bucket`.
 * The wrangler integration smoke covers `createUpload`'s URL-signing
 * shape end-to-end; this file covers the rest of the surface (commit,
 * delete, getPublicUrl) that miniflare does not exercise because the
 * presigned URL points at the real `*.r2.cloudflarestorage.com` host.
 */

interface FakeR2ObjectBody {
  readonly size: number;
  readonly etag: string;
  readonly httpMetadata?: { contentType?: string };
  readonly customMetadata?: Record<string, string>;
  readonly body: ReadableStream;
}

interface FakeBucketState {
  readonly objects: Map<string, FakeR2ObjectBody>;
  readonly puts: Array<{
    key: string;
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }>;
  readonly deletes: string[];
}

function fakeBucket(): { state: FakeBucketState; bucket: R2Bucket } {
  const state: FakeBucketState = {
    objects: new Map(),
    puts: [],
    deletes: [],
  };
  const bucket = {
    async get(key: string): Promise<FakeR2ObjectBody | null> {
      return state.objects.get(key) ?? null;
    },
    async put(
      key: string,
      _body: unknown,
      opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
    ): Promise<unknown> {
      state.puts.push({
        key,
        httpMetadata: opts?.httpMetadata,
        customMetadata: opts?.customMetadata,
      });
      const existing = state.objects.get(key);
      if (existing) {
        state.objects.set(key, {
          ...existing,
          httpMetadata: opts?.httpMetadata ?? existing.httpMetadata,
          customMetadata: opts?.customMetadata ?? existing.customMetadata,
        });
      }
      return {};
    },
    async delete(key: string): Promise<void> {
      state.deletes.push(key);
      state.objects.delete(key);
    },
    async head(): Promise<unknown> {
      throw new Error("head() should not be called — the optimised path uses get()");
    },
  } satisfies Partial<R2Bucket> as unknown as R2Bucket;
  return { state, bucket };
}

function counterIdGenerator(prefix = "id"): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}

function makeStorage(state: FakeBucketState | null = null): {
  storage: R2MediaStorage;
  state: FakeBucketState;
} {
  const fake = state ? { state, bucket: makeBucketFor(state) } : fakeBucket();
  const s3 = new AwsClient({
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    service: "s3",
    region: "auto",
  });
  return {
    storage: new R2MediaStorage(
      fake.bucket,
      s3,
      "https://test-bucket.example.r2.cloudflarestorage.com",
      "https://media.example.test",
      counterIdGenerator(),
    ),
    state: fake.state,
  };
}

function makeBucketFor(state: FakeBucketState): R2Bucket {
  return {
    async get(key: string) {
      return state.objects.get(key) ?? null;
    },
    async put(key: string, _body: unknown, opts?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
      state.puts.push({ key, httpMetadata: opts?.httpMetadata, customMetadata: opts?.customMetadata });
      return {};
    },
    async delete(key: string) {
      state.deletes.push(key);
    },
    async head() {
      throw new Error("head() should not be called");
    },
  } satisfies Partial<R2Bucket> as unknown as R2Bucket;
}

function emptyStream(): ReadableStream {
  return new ReadableStream({
    start(controller): void {
      controller.close();
    },
  });
}

function seedObject(
  state: FakeBucketState,
  key: string,
  opts: {
    size: number;
    etag?: string;
    contentType?: string;
    customMetadata?: Record<string, string>;
  },
): void {
  state.objects.set(key, {
    size: opts.size,
    etag: opts.etag ?? '"abcdef1234567890"',
    httpMetadata: { contentType: opts.contentType ?? "image/png" },
    customMetadata: opts.customMetadata,
    body: emptyStream(),
  });
}

const NOW = 1_700_000_000_000;

describe("R2MediaStorage ctor", () => {
  it("throws MEDIA_NOT_CONFIGURED on empty publicBase", () => {
    const { bucket } = fakeBucket();
    const s3 = new AwsClient({
      accessKeyId: "k",
      secretAccessKey: "s",
      service: "s3",
      region: "auto",
    });
    expect(
      () => new R2MediaStorage(bucket, s3, "https://endpoint", ""),
    ).toThrowError(/MEDIA_NOT_CONFIGURED/);
  });
});

describe("R2MediaStorage.createUpload", () => {
  it("returns a SigV4-signed PUT URL with X-Amz-Expires + Content-Type required header", async () => {
    const { storage } = makeStorage();
    const result = await storage.createUpload({
      filename: "cover.png",
      mimeType: "image/png",
      maxBytes: 1024 * 1024,
      now: NOW,
      expiresAt: NOW + 15 * 60 * 1000,
    });
    expect(result.method).toBe("PUT");
    expect(result.uploadId).toBe("id-1");
    expect(result.storageKey).toBe("id-2.png");
    expect(result.uploadUrl).toMatch(
      /^https:\/\/test-bucket\.example\.r2\.cloudflarestorage\.com\/id-2\.png\?/,
    );
    expect(result.uploadUrl).toContain("X-Amz-Expires=900");
    expect(result.uploadUrl).toContain("X-Amz-Signature=");
    expect(result.requiredHeaders?.["Content-Type"]).toBe("image/png");
    expect(result.publicUrl).toBe("https://media.example.test/id-2.png");
  });

  it("prefixes storageKey with purpose when supplied", async () => {
    const { storage } = makeStorage();
    const result = await storage.createUpload({
      filename: "a.jpg",
      mimeType: "image/jpeg",
      maxBytes: 1024,
      purpose: "post-cover",
      now: NOW,
      expiresAt: NOW + 60_000,
    });
    expect(result.storageKey).toBe("post-cover/id-2.jpg");
  });

  it("clamps short TTLs to a 60-second floor", async () => {
    const { storage } = makeStorage();
    const result = await storage.createUpload({
      filename: "x.png",
      mimeType: "image/png",
      maxBytes: 1024,
      now: NOW,
      expiresAt: NOW + 5_000,
    });
    expect(result.uploadUrl).toContain("X-Amz-Expires=60");
  });
});

describe("R2MediaStorage.commitUpload", () => {
  it("happy path: stamps committedAt + alt + caption, returns MediaAsset", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "post-cover/key.png", {
      size: 4096,
      contentType: "image/png",
    });
    const asset = await storage.commitUpload({
      uploadId: "upload-1",
      storageKey: "post-cover/key.png",
      expectedMimeType: "image/png",
      maxBytes: 25 * 1024 * 1024,
      alt: "the cover",
      caption: "a caption",
      now: NOW,
    });
    expect(asset.publicUrl).toBe("https://media.example.test/post-cover/key.png");
    expect(asset.mimeType).toBe("image/png");
    expect(asset.byteSize).toBe(4096);
    expect(asset.alt).toBe("the cover");
    expect(asset.metadata?.["committedAt"]).toBe(String(NOW));
    expect(asset.metadata?.["alt"]).toBe("the cover");
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0]?.customMetadata?.["committedAt"]).toBe(String(NOW));
  });

  it("preserves existing customMetadata while adding committedAt", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "k.png", {
      size: 1024,
      contentType: "image/png",
      customMetadata: { previewWidth: "320" },
    });
    await storage.commitUpload({
      uploadId: "u",
      storageKey: "k.png",
      expectedMimeType: "image/png",
      maxBytes: 25 * 1024 * 1024,
      now: NOW,
    });
    expect(state.puts[0]?.customMetadata).toMatchObject({
      previewWidth: "320",
      committedAt: String(NOW),
    });
  });

  it("throws MEDIA_OBJECT_NOT_FOUND when no object exists at storageKey", async () => {
    const { storage } = makeStorage();
    await expect(
      storage.commitUpload({
        uploadId: "u",
        storageKey: "missing.png",
        expectedMimeType: "image/png",
        maxBytes: 1024,
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_OBJECT_NOT_FOUND" } });
  });

  it("throws MEDIA_MIME_REJECTED when actual content-type differs from expected", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "k", { size: 1024, contentType: "image/jpeg" });
    await expect(
      storage.commitUpload({
        uploadId: "u",
        storageKey: "k",
        expectedMimeType: "image/png",
        maxBytes: 1024 * 1024,
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_MIME_REJECTED" } });
    expect(state.puts).toHaveLength(0);
  });

  it("throws MEDIA_SIZE_EXCEEDED when actual byte size exceeds maxBytes", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "k", { size: 5_000_000, contentType: "image/png" });
    await expect(
      storage.commitUpload({
        uploadId: "u",
        storageKey: "k",
        expectedMimeType: "image/png",
        maxBytes: 1_000_000,
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_SIZE_EXCEEDED" } });
    expect(state.puts).toHaveLength(0);
  });

  it("throws MEDIA_CHECKSUM_MISMATCH when supplied checksum differs from etag", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "k", {
      size: 1024,
      etag: '"server-side-etag-value"',
      contentType: "image/png",
    });
    await expect(
      storage.commitUpload({
        uploadId: "u",
        storageKey: "k",
        expectedMimeType: "image/png",
        maxBytes: 1024 * 1024,
        checksum: "wrong-client-checksum",
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_CHECKSUM_MISMATCH" } });
    expect(state.puts).toHaveLength(0);
  });

  it("accepts matching checksum (etag stripped of surrounding quotes)", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "k", {
      size: 1024,
      etag: '"abcdef"',
      contentType: "image/png",
    });
    const asset = await storage.commitUpload({
      uploadId: "u",
      storageKey: "k",
      expectedMimeType: "image/png",
      maxBytes: 1024 * 1024,
      checksum: "abcdef",
      now: NOW,
    });
    expect(asset.id).toBe("u");
  });
});

describe("R2MediaStorage.getPublicUrl", () => {
  it("returns publicBase + storageKey", async () => {
    const { storage } = makeStorage();
    const url = await storage.getPublicUrl({
      assetId: "a-id",
      storageKey: "post-cover/x.png",
    });
    expect(url).toBe("https://media.example.test/post-cover/x.png");
  });
});

describe("R2MediaStorage.deleteAsset", () => {
  it("calls bucket.delete with the storageKey", async () => {
    const { storage, state } = makeStorage();
    await storage.deleteAsset({ assetId: "id", storageKey: "key/x.png" });
    expect(state.deletes).toEqual(["key/x.png"]);
  });
});
