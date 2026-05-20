import { describe, expect, it } from "vitest";
import { AwsClient } from "aws4fetch";
import type { IdGenerator } from "@aotter/mantle-runtime";
import { R2MediaStorage } from "../src/bindings/R2MediaStorage.js";

/**
 * Unit-tests `R2MediaStorage` directly against a fake `R2Bucket`.
 * The wrangler integration smoke covers `createUpload`'s URL-signing
 * shape end-to-end; this file covers the rest of the surface (commit,
 * delete, getPublicUrl) that miniflare does not exercise because the
 * presigned URL points at the real `*.r2.cloudflarestorage.com` host.
 *
 * Rewritten for the #272 multi-variant shape: every asset has N variants
 * keyed under a shared `<purpose>/<uploadGroupId>/<role>.<ext>` prefix.
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

function makeStorage(): {
  storage: R2MediaStorage;
  state: FakeBucketState;
} {
  const fake = fakeBucket();
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

describe("R2MediaStorage.createUpload (multi-variant)", () => {
  it("signs one PUT URL per declared variant under a shared group prefix", async () => {
    const { storage } = makeStorage();
    const result = await storage.createUpload({
      uploadGroupId: "asset-abc",
      purpose: "post-cover",
      variants: [
        { mimeType: "image/avif", byteSize: 60_000, maxBytes: 200_000, role: "alternate" },
        { mimeType: "image/webp", byteSize: 80_000, maxBytes: 300_000, role: "alternate" },
        { mimeType: "image/jpeg", byteSize: 110_000, maxBytes: 500_000, role: "primary" },
      ],
      now: NOW,
      expiresAt: NOW + 15 * 60 * 1000,
    });
    expect(result.uploadGroupId).toBe("asset-abc");
    expect(result.capabilities).toHaveLength(3);
    expect(result.capabilities.map((c) => c.storageKey)).toEqual([
      "post-cover/asset-abc/alternate.avif",
      "post-cover/asset-abc/alternate.webp",
      "post-cover/asset-abc/primary.jpg",
    ]);
    for (const cap of result.capabilities) {
      expect(cap.method).toBe("PUT");
      expect(cap.uploadUrl).toMatch(/^https:\/\/test-bucket\.example\.r2\.cloudflarestorage\.com\//);
      expect(cap.uploadUrl).toContain("X-Amz-Expires=900");
      expect(cap.uploadUrl).toContain("X-Amz-Signature=");
      expect(cap.requiredHeaders?.["Content-Type"]).toBe(cap.mimeType);
      expect(cap.publicUrl).toContain("https://media.example.test/");
    }
  });

  it("clamps short TTLs to a 60-second floor", async () => {
    const { storage } = makeStorage();
    const result = await storage.createUpload({
      uploadGroupId: "asset-xyz",
      purpose: "post-cover",
      variants: [
        { mimeType: "image/jpeg", byteSize: 10, maxBytes: 1024, role: "primary" },
      ],
      now: NOW,
      expiresAt: NOW + 5_000,
    });
    expect(result.capabilities[0]!.uploadUrl).toContain("X-Amz-Expires=60");
  });
});

describe("R2MediaStorage.commitUpload (multi-variant)", () => {
  it("happy path: HEAD-verifies every variant, stamps committedAt/role, returns full MediaAsset", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "post-cover/asset-abc/alternate.avif", { size: 60_000, contentType: "image/avif" });
    seedObject(state, "post-cover/asset-abc/alternate.webp", { size: 80_000, contentType: "image/webp" });
    seedObject(state, "post-cover/asset-abc/primary.jpg", { size: 110_000, contentType: "image/jpeg" });

    const asset = await storage.commitUpload({
      uploadGroupId: "asset-abc",
      variants: [
        { mimeType: "image/avif", role: "alternate", storageKey: "post-cover/asset-abc/alternate.avif", maxBytes: 200_000 },
        { mimeType: "image/webp", role: "alternate", storageKey: "post-cover/asset-abc/alternate.webp", maxBytes: 300_000 },
        { mimeType: "image/jpeg", role: "primary",  storageKey: "post-cover/asset-abc/primary.jpg",     maxBytes: 500_000 },
      ],
      alt: "the cover",
      caption: "a caption",
      now: NOW,
    });

    expect(asset.id).toBe("asset-abc");
    expect(asset.variants).toHaveLength(3);
    const primary = asset.variants.find((v) => v.role === "primary")!;
    expect(primary.mimeType).toBe("image/jpeg");
    expect(primary.publicUrl).toBe("https://media.example.test/post-cover/asset-abc/primary.jpg");
    expect(asset.alt).toBe("the cover");
    expect(state.puts).toHaveLength(3);
    expect(state.puts[2]?.customMetadata?.["committedAt"]).toBe(String(NOW));
    expect(state.puts[2]?.customMetadata?.["role"]).toBe("primary");
    expect(state.puts[2]?.customMetadata?.["uploadGroupId"]).toBe("asset-abc");
  });

  it("rejects the whole commit when any variant is missing", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "post-cover/asset/primary.jpg", { size: 1024, contentType: "image/jpeg" });
    // alternate.avif not seeded — HEAD should miss
    await expect(
      storage.commitUpload({
        uploadGroupId: "asset",
        variants: [
          { mimeType: "image/avif", role: "alternate", storageKey: "post-cover/asset/alternate.avif", maxBytes: 200_000 },
          { mimeType: "image/jpeg", role: "primary",   storageKey: "post-cover/asset/primary.jpg",     maxBytes: 500_000 },
        ],
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_OBJECT_NOT_FOUND" } });
  });

  it("rejects when any variant's actual mime differs from declared", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "post-cover/asset/primary.jpg", { size: 1024, contentType: "image/webp" });
    await expect(
      storage.commitUpload({
        uploadGroupId: "asset",
        variants: [
          { mimeType: "image/jpeg", role: "primary", storageKey: "post-cover/asset/primary.jpg", maxBytes: 500_000 },
        ],
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_MIME_REJECTED" } });
  });

  it("rejects when any variant exceeds its per-mime maxBytes", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "post-cover/asset/primary.jpg", { size: 1_000_000, contentType: "image/jpeg" });
    await expect(
      storage.commitUpload({
        uploadGroupId: "asset",
        variants: [
          { mimeType: "image/jpeg", role: "primary", storageKey: "post-cover/asset/primary.jpg", maxBytes: 500_000 },
        ],
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_VARIANT_SIZE_EXCEEDED" } });
  });

  it("rejects when no variant carries role='primary'", async () => {
    const { storage, state } = makeStorage();
    seedObject(state, "post-cover/asset/alternate.avif", { size: 100, contentType: "image/avif" });
    await expect(
      storage.commitUpload({
        uploadGroupId: "asset",
        variants: [
          { mimeType: "image/avif", role: "alternate", storageKey: "post-cover/asset/alternate.avif", maxBytes: 200_000 },
        ],
        now: NOW,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_VARIANTS_INCOMPLETE" } });
  });
});

describe("R2MediaStorage.getPublicUrl", () => {
  it("returns publicBase + storageKey", async () => {
    const { storage } = makeStorage();
    const url = await storage.getPublicUrl({ storageKey: "post-cover/asset-abc/primary.jpg" });
    expect(url).toBe("https://media.example.test/post-cover/asset-abc/primary.jpg");
  });
});

describe("R2MediaStorage.deleteObject", () => {
  it("calls bucket.delete with the storageKey", async () => {
    const { storage, state } = makeStorage();
    await storage.deleteObject({ storageKey: "post-cover/asset-abc/primary.jpg" });
    expect(state.deletes).toEqual(["post-cover/asset-abc/primary.jpg"]);
  });
});
