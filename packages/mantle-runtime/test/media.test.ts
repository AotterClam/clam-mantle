import { describe, it, expect } from "vitest";
import type { MediaAsset, MediaStorage, MediaVariant } from "../src/domain/port/MediaStorage.js";
import type { MediaAssetRepository } from "../src/domain/port/MediaAssetRepository.js";
import {
  CommitMediaUploadUseCase,
  CreateMediaUploadUseCase,
} from "../src/usecase/media/index.js";
import { InMemoryKv } from "./fakes/kv.js";
import { InMemorySiteConfigRepository } from "./fakes/site-config.js";

const DEFAULT_PURPOSES = ["post-cover", "product-cover"] as const;

class FakeMediaStorage implements MediaStorage {
  public createCalls: Parameters<MediaStorage["createUpload"]>[0][] = [];
  public commitCalls: Parameters<MediaStorage["commitUpload"]>[0][] = [];

  async createUpload(args: Parameters<MediaStorage["createUpload"]>[0]) {
    this.createCalls.push(args);
    return {
      uploadGroupId: args.uploadGroupId,
      capabilities: args.variants.map((v) => ({
        mimeType: v.mimeType,
        role: v.role,
        method: "PUT" as const,
        uploadUrl: `https://r2.example/${args.uploadGroupId}/${v.role}?signed=1`,
        storageKey: `${args.purpose}/${args.uploadGroupId}/${v.role}`,
        publicUrl: `https://media.example/${args.purpose}/${args.uploadGroupId}/${v.role}`,
        requiredHeaders: { "Content-Type": v.mimeType },
      })),
      expiresAt: args.expiresAt,
    };
  }

  async commitUpload(args: Parameters<MediaStorage["commitUpload"]>[0]) {
    this.commitCalls.push(args);
    const variants: MediaVariant[] = args.variants.map((v) => ({
      mimeType: v.mimeType,
      publicUrl: `https://media.example/${v.storageKey}`,
      storageKey: v.storageKey,
      byteSize: 1024,
      role: v.role,
    }));
    return {
      id: args.uploadGroupId,
      variants,
      alt: args.alt,
      caption: args.caption,
      createdAt: args.now,
    };
  }

  async getPublicUrl(args: Parameters<MediaStorage["getPublicUrl"]>[0]) {
    return `https://media.example/${args.storageKey}`;
  }

  async deleteObject(): Promise<void> {
    /* noop */
  }
}

class InMemoryMediaAssetRepository implements MediaAssetRepository {
  public saved: MediaAsset[] = [];
  private store = new Map<string, MediaAsset>();

  async findById(id: string): Promise<MediaAsset | null> {
    return this.store.get(id) ?? null;
  }

  async findManyByIds(ids: readonly string[]): Promise<ReadonlyMap<string, MediaAsset>> {
    const out = new Map<string, MediaAsset>();
    for (const id of ids) {
      const a = this.store.get(id);
      if (a) out.set(id, a);
    }
    return out;
  }

  async save(asset: MediaAsset): Promise<void> {
    this.saved.push(asset);
    this.store.set(asset.id, asset);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

const FROZEN_NOW = 1_700_000_000_000;
const fakeClock = { now: () => FROZEN_NOW };

class CountingIdGenerator {
  private n = 0;
  next(): string {
    this.n += 1;
    return `asset-${this.n}`;
  }
}

const THREE_VARIANTS = [
  { mimeType: "image/avif", byteSize: 60_000, role: "alternate" as const },
  { mimeType: "image/webp", byteSize: 80_000, role: "alternate" as const },
  { mimeType: "image/jpeg", byteSize: 110_000, role: "primary" as const },
];

function makeCreateUseCase(opts: {
  storage: FakeMediaStorage;
  kv: InMemoryKv;
  site: InMemorySiteConfigRepository;
  idgen?: CountingIdGenerator;
  allowSvg?: boolean;
}): CreateMediaUploadUseCase {
  return new CreateMediaUploadUseCase(
    opts.storage,
    opts.kv,
    fakeClock,
    opts.idgen ?? new CountingIdGenerator(),
    opts.site,
    { allowSvg: opts.allowSvg ?? false },
  );
}

describe("CreateMediaUploadUseCase (#272 multi-variant)", () => {
  it("rejects undeclared purpose with MEDIA_PURPOSE_REJECTED (fail-closed)", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "x.png",
        purpose: "not-declared",
        variants: THREE_VARIANTS,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_PURPOSE_REJECTED" } });
  });

  it("rejects every purpose when none declared (fail-closed)", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([]);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "x.png",
        purpose: "post-cover",
        variants: THREE_VARIANTS,
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_PURPOSE_REJECTED" } });
  });

  it("rejects when variants don't cover the required mime set", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "x.png",
        purpose: "post-cover",
        variants: [
          { mimeType: "image/jpeg", byteSize: 100, role: "primary" },
          // missing webp + avif
        ],
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_VARIANTS_INCOMPLETE" } });
  });

  it("rejects when no primary variant is declared", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "x.png",
        purpose: "post-cover",
        variants: THREE_VARIANTS.map((v) => ({ ...v, role: "alternate" as const })),
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_VARIANTS_INCOMPLETE" } });
  });

  it("forwards per-mime maxBytes from the purpose policy to the adapter", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([
      {
        name: "post-cover",
        required: ["image/avif", "image/webp", "image/jpeg"],
        maxBytes: {
          "image/avif": 50_000,
          "image/webp": 80_000,
          "image/jpeg": 100_000,
        },
      },
    ]);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await useCase.execute({
      filename: "x.png",
      purpose: "post-cover",
      variants: [
        { mimeType: "image/avif", byteSize: 40_000, role: "alternate" },
        { mimeType: "image/webp", byteSize: 60_000, role: "alternate" },
        { mimeType: "image/jpeg", byteSize: 90_000, role: "primary" },
      ],
    });
    expect(storage.createCalls).toHaveLength(1);
    expect(storage.createCalls[0]!.variants.map((v) => v.maxBytes)).toEqual([
      50_000,
      80_000,
      100_000,
    ]);
  });

  it("rejects suspicious sizing: avif > jpeg", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "unoptimized.jpg",
        purpose: "post-cover",
        variants: [
          { mimeType: "image/avif", byteSize: 200_000, role: "alternate" },
          { mimeType: "image/webp", byteSize: 80_000, role: "alternate" },
          { mimeType: "image/jpeg", byteSize: 100_000, role: "primary" },
        ],
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_VARIANTS_SUSPICIOUS_SIZE" } });
  });

  it("rejects suspicious sizing: webp > jpeg", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "unoptimized.jpg",
        purpose: "post-cover",
        variants: [
          { mimeType: "image/avif", byteSize: 60_000, role: "alternate" },
          { mimeType: "image/webp", byteSize: 150_000, role: "alternate" },
          { mimeType: "image/jpeg", byteSize: 100_000, role: "primary" },
        ],
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_VARIANTS_SUSPICIOUS_SIZE" } });
  });

  it("skips suspicious-sizing check when no classic fallback present", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([
      {
        name: "avif-only",
        required: ["image/avif"],
        maxBytes: { "image/avif": 1_000_000 },
      },
    ]);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "avif-only.avif",
        purpose: "avif-only",
        variants: [{ mimeType: "image/avif", byteSize: 200_000, role: "primary" }],
      }),
    ).resolves.toMatchObject({ capabilities: expect.any(Array) });
  });

  it("rejects mime types outside the allowlist on any variant", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([
      {
        name: "post-cover",
        required: ["application/octet-stream"],
        maxBytes: { "application/octet-stream": 1_000_000 },
      },
    ]);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "x.exe",
        purpose: "post-cover",
        variants: [{ mimeType: "application/octet-stream", byteSize: 100, role: "primary" }],
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_MIME_REJECTED" } });
  });

  it("persists a KV record keyed by uploadGroupId", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = makeCreateUseCase({ storage, kv, site });
    const result = await useCase.execute({
      filename: "cover.png",
      purpose: "post-cover",
      variants: THREE_VARIANTS,
    });
    expect(result.uploadGroupId).toBe("asset-1");
    expect(result.capabilities).toHaveLength(3);
    const raw = await kv.get(`media:pending:${result.uploadGroupId}`);
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw!);
    expect(record.purpose).toBe("post-cover");
    expect(record.variants).toHaveLength(3);
    expect(record.variants[0].storageKey).toContain("asset-1");
  });

  it("rejects SVG by default", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([
      {
        name: "post-cover",
        required: ["image/svg+xml"],
        maxBytes: { "image/svg+xml": 1_000_000 },
      },
    ]);
    const useCase = makeCreateUseCase({ storage, kv, site });
    await expect(
      useCase.execute({
        filename: "x.svg",
        purpose: "post-cover",
        variants: [{ mimeType: "image/svg+xml", byteSize: 100, role: "primary" }],
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_SVG_REJECTED" } });
  });

  it("accepts SVG when allowSvg flag is on", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([
      {
        name: "post-cover",
        required: ["image/svg+xml"],
        maxBytes: { "image/svg+xml": 1_000_000 },
      },
    ]);
    const useCase = makeCreateUseCase({ storage, kv, site, allowSvg: true });
    const r = await useCase.execute({
      filename: "x.svg",
      purpose: "post-cover",
      variants: [{ mimeType: "image/svg+xml", byteSize: 100, role: "primary" }],
    });
    expect(r.uploadGroupId).toBe("asset-1");
  });
});

describe("CommitMediaUploadUseCase (#272)", () => {
  it("returns MEDIA_UPLOAD_EXPIRED when KV record is missing", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const assets = new InMemoryMediaAssetRepository();
    const useCase = new CommitMediaUploadUseCase(storage, kv, fakeClock, assets);
    await expect(useCase.execute({ uploadGroupId: "missing" })).rejects.toMatchObject({
      diagnostic: { code: "MEDIA_UPLOAD_EXPIRED" },
    });
  });

  it("persists the committed asset + clears the pending KV record", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const assets = new InMemoryMediaAssetRepository();
    const create = makeCreateUseCase({ storage, kv, site });
    const created = await create.execute({
      filename: "x.png",
      purpose: "post-cover",
      variants: THREE_VARIANTS,
    });
    const commit = new CommitMediaUploadUseCase(storage, kv, fakeClock, assets);
    const asset = await commit.execute({
      uploadGroupId: created.uploadGroupId,
      alt: "an image",
      caption: "ok",
    });
    expect(asset.id).toBe(created.uploadGroupId);
    expect(asset.variants).toHaveLength(3);
    expect(asset.variants.find((v) => v.role === "primary")?.mimeType).toBe("image/jpeg");
    expect(asset.alt).toBe("an image");
    expect(assets.saved).toHaveLength(1);
    expect(assets.saved[0]!.id).toBe(created.uploadGroupId);
    expect(await kv.get(`media:pending:${created.uploadGroupId}`)).toBeNull();
  });
});
