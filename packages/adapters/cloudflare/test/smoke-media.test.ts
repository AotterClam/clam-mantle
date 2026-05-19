import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type {
  CommitUploadArgs,
  CreateUploadArgs,
  Manifest,
  MediaStorage,
} from "@aotter/mantle-runtime";
import { createCmsRef } from "../src/mount/bootRuntimeOnce.js";
import { mountServerEndpoints } from "../src/mount/mountServerEndpoints.js";
import type { Auth } from "../src/auth/createAuth.js";
import { InMemoryDatabase } from "../../../mantle-runtime/test/fakes/database.js";
import {
  InMemoryKv,
  StubAssetServer,
  stubAuth,
} from "./fakes/runtime-bindings.js";

/**
 * Smoke: `/admin/api/media/uploads` lifecycle.
 *
 * Covers:
 * - 501 + MEDIA_NOT_CONFIGURED when no `mediaStorage` is bound
 * - happy-path create + commit through the use cases
 * - mime allowlist rejection bubbles a structured diagnostic out the
 *   wire path
 * - admin session enforcement (401 when no Better Auth session)
 */
class FakeMediaStorage implements MediaStorage {
  public createCalls: CreateUploadArgs[] = [];
  public commitCalls: CommitUploadArgs[] = [];

  async createUpload(args: CreateUploadArgs) {
    this.createCalls.push(args);
    return {
      uploadId: `upload-${this.createCalls.length}`,
      method: "PUT" as const,
      uploadUrl: `https://r2.example/key.png?X-Amz-Expires=900`,
      storageKey: "post-cover/key.png",
      expiresAt: args.expiresAt,
      requiredHeaders: { "Content-Type": args.mimeType },
    };
  }

  async commitUpload(args: CommitUploadArgs) {
    this.commitCalls.push(args);
    return {
      id: args.uploadId,
      storageKey: args.storageKey,
      publicUrl: `https://media.example/${args.storageKey}`,
      mimeType: args.expectedMimeType,
      byteSize: 4096,
      alt: args.alt,
      caption: args.caption,
      createdAt: args.now,
    };
  }

  async getPublicUrl(args: { assetId: string; storageKey: string }) {
    return `https://media.example/${args.storageKey}`;
  }

  async deleteAsset() {
    /* noop */
  }
}

function manifests(): Manifest[] {
  return [
    {
      apiVersion: "cms.mantle.aotter.net/v1",
      kind: "Schema",
      metadata: { name: "posts" },
      spec: {
        title: "Posts",
        schema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            coverUrl: { type: "string", format: "uri", "x-mcp-hint": "media-image" },
          },
          required: ["slug"],
        },
        lifecycle: "simple",
      },
    },
  ];
}

const STAFF_USER = {
  id: "u-admin",
  email: "admin@example.test",
  name: "Admin",
  role: "owner" as const,
  githubLogin: "admin-login",
};

function staffAuth(): Auth {
  return {
    handler: stubAuth.handler,
    getSession: async () => ({
      session: { id: "sess-1", userId: STAFF_USER.id, expiresAt: new Date(Date.now() + 60_000) },
      user: STAFF_USER,
    }),
    getUserRole: async () => "owner",
    methods: [],
  };
}

interface Harness {
  app: Hono;
  storage: FakeMediaStorage | null;
}

function harness(opts: {
  withMedia: boolean;
  auth: Auth;
  /** Declared media purposes; defaults to a non-empty set so existing
   *  smoke cases that exercise mime / size / commit paths can pass
   *  fail-closed purpose enforcement (#262) with `purpose: "post-cover"`. */
  mediaPurposes?: readonly string[];
}): Harness {
  const storage = opts.withMedia ? new FakeMediaStorage() : null;
  const ref = createCmsRef({
    manifests: manifests(),
    siteDefaults: {
      media: { purposes: opts.mediaPurposes ?? ["post-cover"] },
    },
    bindings: {
      db: new InMemoryDatabase(),
      kv: new InMemoryKv(),
      assets: new StubAssetServer(),
      ...(storage ? { mediaStorage: storage } : {}),
    },
    auth: opts.auth,
  });
  const app = new Hono();
  mountServerEndpoints(app, ref);
  return { app, storage };
}

describe("smoke: /admin/api/media/uploads", () => {
  it("returns 501 + MEDIA_NOT_CONFIGURED when no mediaStorage is bound", async () => {
    const h = harness({ withMedia: false, auth: staffAuth() });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "x.png", mimeType: "image/png", byteSize: 100 }),
    });
    expect(res.status).toBe(501);
    const body = (await res.json()) as { diagnostic: { code: string } };
    expect(body.diagnostic.code).toBe("MEDIA_NOT_CONFIGURED");
  });

  it("returns 401 when there is no admin session", async () => {
    const h = harness({ withMedia: true, auth: stubAuth });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "x.png", mimeType: "image/png", byteSize: 100 }),
    });
    expect(res.status).toBe(401);
  });

  it("happy path: create returns uploadId + uploadUrl", async () => {
    const h = harness({ withMedia: true, auth: staffAuth() });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: "cover.png",
        mimeType: "image/png",
        byteSize: 1234,
        purpose: "post-cover",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      uploadId: string;
      uploadUrl: string;
      method: string;
      requiredHeaders?: Record<string, string>;
    };
    expect(body.uploadId).toBe("upload-1");
    expect(body.method).toBe("PUT");
    expect(body.requiredHeaders?.["Content-Type"]).toBe("image/png");
    expect(h.storage!.createCalls).toHaveLength(1);
  });

  it("rejects disallowed mime with structured diagnostic", async () => {
    const h = harness({ withMedia: true, auth: staffAuth() });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: "x.exe",
        mimeType: "application/octet-stream",
        byteSize: 100,
        purpose: "post-cover",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; diagnostic: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.diagnostic.code).toBe("MEDIA_MIME_REJECTED");
  });

  it("rejects undeclared purpose with MEDIA_PURPOSE_REJECTED (#262)", async () => {
    const h = harness({ withMedia: true, auth: staffAuth() });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: "x.png",
        mimeType: "image/png",
        byteSize: 100,
        purpose: "mcp-e2e",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; diagnostic: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.diagnostic.code).toBe("MEDIA_PURPOSE_REJECTED");
  });

  it("rejects upload when no purposes declared (#262 fail-closed)", async () => {
    const h = harness({ withMedia: true, auth: staffAuth(), mediaPurposes: [] });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: "x.png",
        mimeType: "image/png",
        byteSize: 100,
        purpose: "post-cover",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { diagnostic: { code: string } };
    expect(body.diagnostic.code).toBe("MEDIA_PURPOSE_REJECTED");
  });

  it("rejects request missing byteSize with INPUT_VALIDATION_FAILED (mandatory ceiling check)", async () => {
    const h = harness({ withMedia: true, auth: staffAuth() });
    const res = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "x.png", mimeType: "image/png" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; diagnostic: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.diagnostic.code).toBe("INPUT_VALIDATION_FAILED");
  });

  it("commit returns MEDIA_UPLOAD_EXPIRED when the uploadId has no KV record", async () => {
    const h = harness({ withMedia: true, auth: staffAuth() });
    const res = await h.app.request("/admin/api/media/uploads/missing/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(410);
    const body = (await res.json()) as { diagnostic: { code: string } };
    expect(body.diagnostic.code).toBe("MEDIA_UPLOAD_EXPIRED");
  });

  it("create + commit roundtrip writes a MediaAsset back", async () => {
    const h = harness({ withMedia: true, auth: staffAuth() });
    const createRes = await h.app.request("/admin/api/media/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: "x.png",
        mimeType: "image/png",
        byteSize: 2048,
        purpose: "post-cover",
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { uploadId: string };

    const commitRes = await h.app.request(
      `/admin/api/media/uploads/${created.uploadId}/commit`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alt: "the cover" }),
      },
    );
    expect(commitRes.status).toBe(200);
    const asset = (await commitRes.json()) as { publicUrl: string; alt?: string };
    expect(asset.publicUrl).toContain("post-cover/key.png");
    expect(asset.alt).toBe("the cover");
    expect(h.storage!.commitCalls).toHaveLength(1);
  });
});
