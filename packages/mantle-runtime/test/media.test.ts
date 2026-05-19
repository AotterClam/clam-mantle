import { describe, it, expect } from "vitest";
import type { MediaStorage } from "../src/domain/port/MediaStorage.js";
import { CommitMediaUploadUseCase, CreateMediaUploadUseCase } from "../src/usecase/media/index.js";
import { InMemoryKv } from "./fakes/kv.js";
import { InMemorySiteConfigRepository } from "./fakes/site-config.js";

/** Tests below hand the use case a purpose that's in this default set
 *  so the fail-closed enforcement (#262) doesn't trip every assertion.
 *  Tests that exercise purpose rejection construct their own repo. */
const DEFAULT_PURPOSES = ["post-cover", "product-cover"] as const;

class FakeMediaStorage implements MediaStorage {
  public createCalls: unknown[] = [];
  public commitCalls: unknown[] = [];
  public nextStorageKey = "fake-key.png";
  public nextUploadId = "fake-upload-id";

  async createUpload(args: Parameters<MediaStorage["createUpload"]>[0]) {
    this.createCalls.push(args);
    return {
      uploadId: this.nextUploadId,
      method: "PUT" as const,
      uploadUrl: `https://r2.example/${this.nextStorageKey}?signed=1`,
      storageKey: this.nextStorageKey,
      expiresAt: args.expiresAt,
      requiredHeaders: { "Content-Type": args.mimeType },
    };
  }

  async commitUpload(args: Parameters<MediaStorage["commitUpload"]>[0]) {
    this.commitCalls.push(args);
    return {
      id: args.uploadId,
      storageKey: args.storageKey,
      publicUrl: `https://media.example/${args.storageKey}`,
      mimeType: args.expectedMimeType,
      byteSize: 1024,
      alt: args.alt,
      caption: args.caption,
      createdAt: args.now,
    };
  }

  async getPublicUrl(args: Parameters<MediaStorage["getPublicUrl"]>[0]) {
    return `https://media.example/${args.storageKey}`;
  }

  async deleteAsset(): Promise<void> {
    /* noop */
  }
}

const FROZEN_NOW = 1_700_000_000_000;
const fakeClock = { now: () => FROZEN_NOW };

describe("CreateMediaUploadUseCase", () => {
  it("rejects mime types outside the allowlist", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    await expect(
      useCase.execute({
        filename: "x.exe",
        mimeType: "application/octet-stream",
        byteSize: 100,
        purpose: "post-cover",
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_MIME_REJECTED" } });
  });

  it("rejects SVG by default", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    await expect(
      useCase.execute({
        filename: "x.svg",
        mimeType: "image/svg+xml",
        byteSize: 100,
        purpose: "post-cover",
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_SVG_REJECTED" } });
  });

  it("accepts SVG when allowSvg flag is on", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site, { allowSvg: true });
    const result = await useCase.execute({
      filename: "x.svg",
      mimeType: "image/svg+xml",
      byteSize: 100,
      purpose: "post-cover",
    });
    expect(result.uploadId).toBe("fake-upload-id");
  });

  it("rejects byteSize beyond the cap", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site, {
      allowSvg: false,
      maxBytes: 1024,
    });
    await expect(
      useCase.execute({
        filename: "big.jpg",
        mimeType: "image/jpeg",
        byteSize: 2048,
        purpose: "post-cover",
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_SIZE_EXCEEDED" } });
  });

  it("persists a KV mapping under media:pending:<uploadId>", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    const result = await useCase.execute({
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 4096,
      purpose: "post-cover",
    });
    expect(result.uploadId).toBe("fake-upload-id");
    expect(result.method).toBe("PUT");
    const raw = await kv.get(`media:pending:${result.uploadId}`);
    expect(raw).not.toBeNull();
    const record = JSON.parse(raw!);
    expect(record.storageKey).toBe(storage.nextStorageKey);
    expect(record.expectedMimeType).toBe("image/png");
    expect(record.expectedSize).toBe(4096);
    expect(record.expiresAt).toBeGreaterThan(FROZEN_NOW);
  });

  it("rejects undeclared purpose with MEDIA_PURPOSE_REJECTED (fail-closed)", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    await expect(
      useCase.execute({
        filename: "x.png",
        mimeType: "image/png",
        byteSize: 100,
        purpose: "mcp-e2e",
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_PURPOSE_REJECTED" } });
  });

  it("rejects missing purpose with MEDIA_PURPOSE_REJECTED", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    await expect(
      useCase.execute({ filename: "x.png", mimeType: "image/png", byteSize: 100 }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_PURPOSE_REJECTED" } });
  });

  it("rejects every purpose when no purposes declared (fail-closed)", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository([]);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    await expect(
      useCase.execute({
        filename: "x.png",
        mimeType: "image/png",
        byteSize: 100,
        purpose: "post-cover",
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "MEDIA_PURPOSE_REJECTED" } });
  });

  it("storage receives the purpose unchanged on the accepted path", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const useCase = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    await useCase.execute({
      filename: "cover.png",
      mimeType: "image/png",
      byteSize: 100,
      purpose: "product-cover",
    });
    expect(storage.createCalls).toHaveLength(1);
    expect((storage.createCalls[0] as { purpose?: string }).purpose).toBe("product-cover");
  });
});

describe("CommitMediaUploadUseCase", () => {
  it("returns MEDIA_UPLOAD_EXPIRED when KV record is missing", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const useCase = new CommitMediaUploadUseCase(storage, kv, fakeClock);
    await expect(useCase.execute({ uploadId: "missing" })).rejects.toMatchObject({
      diagnostic: { code: "MEDIA_UPLOAD_EXPIRED" },
    });
  });

  it("forwards alt/caption + clears KV record on success", async () => {
    const storage = new FakeMediaStorage();
    const kv = new InMemoryKv();
    const site = new InMemorySiteConfigRepository(DEFAULT_PURPOSES);
    const create = new CreateMediaUploadUseCase(storage, kv, fakeClock, site);
    const created = await create.execute({
      filename: "x.png",
      mimeType: "image/png",
      byteSize: 100,
      purpose: "post-cover",
    });
    const commit = new CommitMediaUploadUseCase(storage, kv, fakeClock);
    const asset = await commit.execute({
      uploadId: created.uploadId,
      alt: "an image",
      caption: "ok",
    });
    expect(asset.publicUrl).toContain(storage.nextStorageKey);
    expect(asset.alt).toBe("an image");
    expect(storage.commitCalls).toHaveLength(1);
    expect(await kv.get(`media:pending:${created.uploadId}`)).toBeNull();
  });
});
