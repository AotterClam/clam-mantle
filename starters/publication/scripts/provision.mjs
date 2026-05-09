#!/usr/bin/env node
/**
 * Single-shot provision orchestrator for starters/publication.
 *
 * Two subcommands:
 *
 *   pnpm run provision:plan -- --project-name X
 *     Reads CF account state, computes the worker URL, and prints the
 *     resources that will be created plus the GitHub OAuth App
 *     instructions. No side effects.
 *
 *   GITHUB_CLIENT_SECRET=... pnpm run provision:up -- \
 *       --project-name X --github-username Y --client-id Z \
 *       [--client-secret W] [--seed-file initial-seed.json]
 *     Creates D1 + 2 KV + Turnstile widget via CF API, writes
 *     wrangler.toml + site defaults, deploys, sets all 4 worker
 *     secrets, optionally syncs/applies initial-seed.json, and prints
 *     the final handoff. CLOUDFLARE_API_TOKEN must be exported.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const COMMAND = process.argv[2];
const SUB_ARGV = process.argv.slice(3);

if (COMMAND === "plan") {
  await plan(parseArgs(SUB_ARGV));
} else if (COMMAND === "up") {
  await up(parseArgs(SUB_ARGV));
} else {
  throw new Error("usage: provision plan|up [args]");
}

async function plan(args) {
  const projectName = requireArg(args, "project-name");
  const names = resourceNames(projectName);
  const token = requireToken();
  const ctx = await fetchContext(token, projectName);
  printPlan(ctx, names);
}

async function up(args) {
  const projectName = requireArg(args, "project-name");
  const names = resourceNames(projectName);
  const githubUsername = requireArg(args, "github-username");
  const clientId = requireArg(args, "client-id");
  const clientSecret = requireSecretArg(args, "client-secret", "GITHUB_CLIENT_SECRET");
  const seedFile = args["seed-file"];
  const token = requireToken();

  const ctx = await fetchContext(token, projectName);
  const seedSite = seedFile ? readSeedSite(seedFile, ctx.workerUrl) : null;
  console.log(`Provisioning ${projectName} → ${ctx.workerUrl}`);

  console.log("\n[1/5] Creating Cloudflare resources...");
  const d1 = await createD1(token, ctx.accountId, names.d1);
  const renderKv = await createKv(token, ctx.accountId, names.renderKv);
  const oauthKv = await createKv(token, ctx.accountId, names.oauthKv);
  const widget = await createWidget(token, ctx.accountId, names.turnstile, ctx.hostname);
  console.log(`  D1:        ${d1.uuid}`);
  console.log(`  Render KV: ${renderKv.id}`);
  console.log(`  OAuth KV:  ${oauthKv.id}`);
  console.log(`  Turnstile: ${widget.sitekey}`);

  console.log("\n[2/5] Writing wrangler.toml + site defaults...");
  updateWranglerToml({
    d1Id: d1.uuid,
    renderKvId: renderKv.id,
    oauthKvId: oauthKv.id,
    turnstileSiteKey: widget.sitekey,
  });
  if (seedSite) {
    updateSeedOrigin(seedFile, ctx.workerUrl);
    runSetupSite({
      projectName,
      brand: seedSite.brand,
      description: seedSite.description,
      locales: seedSite.locales,
      origin: ctx.workerUrl,
    });
  } else {
    updateOrigin(ctx.workerUrl);
  }

  console.log("\n[3/5] Deploying worker...");
  execFileSync("pnpm", ["run", "deploy"], { stdio: "inherit" });

  console.log("\n[4/5] Setting worker secrets...");
  pipeSecret("ADMIN_GITHUB_LOGIN", githubUsername);
  pipeSecret("GITHUB_CLIENT_ID", clientId);
  pipeSecret("GITHUB_CLIENT_SECRET", clientSecret);
  pipeSecret("TURNSTILE_SECRET_KEY", widget.secret);

  if (seedFile) {
    console.log("\n[5/5] Seeding initial content to remote D1/KV...");
    execFileSync(
      "pnpm",
      ["run", "seed:initial", "--", "--seed-file", seedFile, "--origin", ctx.workerUrl, "--remote"],
      { stdio: "inherit" },
    );
  } else {
    console.log("\n[5/5] No --seed-file given; skipping initial seed.");
  }

  printHandoff(ctx, names);
}

function resourceNames(projectName) {
  return {
    projectName,
    worker: projectName,
    d1: `${projectName}-db`,
    renderKv: `${projectName}-render`,
    oauthKv: `${projectName}-oauth`,
    turnstile: projectName,
  };
}

async function fetchContext(token, projectName) {
  const accounts = await cf(token, "/accounts");
  if (accounts.length !== 1) {
    throw new Error(`expected 1 account, got ${accounts.length}; refine token scope`);
  }
  const account = accounts[0];
  const sub = await cf(token, `/accounts/${account.id}/workers/subdomain`);
  const subdomain = sub.subdomain;
  if (!subdomain) {
    throw new Error("workers.dev subdomain not set on this account; visit dash.cloudflare.com → Workers to claim one");
  }
  const hostname = `${projectName}.${subdomain}.workers.dev`;
  return {
    accountId: account.id,
    accountName: account.name,
    subdomain,
    hostname,
    workerUrl: `https://${hostname}`,
  };
}

async function createD1(token, accountId, name) {
  return cf(token, `/accounts/${accountId}/d1/database`, { method: "POST", body: { name } });
}

async function createKv(token, accountId, title) {
  return cf(token, `/accounts/${accountId}/storage/kv/namespaces`, {
    method: "POST",
    body: { title },
  });
}

async function createWidget(token, accountId, name, domain) {
  return cf(token, `/accounts/${accountId}/challenges/widgets`, {
    method: "POST",
    body: { name, domains: [domain], mode: "managed" },
  });
}

async function cf(token, path, opts = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: opts.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`CF API ${opts.method ?? "GET"} ${path} failed: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

function updateWranglerToml({ d1Id, renderKvId, oauthKvId, turnstileSiteKey }) {
  let toml = readFileSync("wrangler.toml", "utf8");
  toml = replaceInBlock(toml, "d1_databases", 'binding = "DB"', "database_id", d1Id);
  toml = replaceInBlock(toml, "kv_namespaces", 'binding = "KV"', "id", renderKvId);
  toml = replaceInBlock(toml, "kv_namespaces", 'binding = "OAUTH_KV"', "id", oauthKvId);
  const next = toml.replace(
    /^TURNSTILE_SITE_KEY = ".*"$/m,
    `TURNSTILE_SITE_KEY = ${JSON.stringify(turnstileSiteKey)}`,
  );
  if (next === toml) throw new Error("TURNSTILE_SITE_KEY line not found in wrangler.toml");
  writeFileSync("wrangler.toml", next);
}

function updateOrigin(workerUrl) {
  const path = "src/clamConfig.ts";
  const text = readFileSync(path, "utf8");
  const next = text.replace(/origin: ".*",/m, `origin: ${JSON.stringify(workerUrl)},`);
  if (next === text) throw new Error("origin line not found in src/clamConfig.ts");
  writeFileSync(path, next);
}

function readSeedSite(seedFile, workerUrl) {
  const raw = JSON.parse(readFileSync(seedFile, "utf8"));
  const brand = requiredJsonString(raw.brand, `${seedFile}: brand`);
  const description = firstJsonString(raw.tagline, raw.description) ?? `Notes, updates, and essays from ${brand}.`;
  const locales = normalizeSeedLocales(raw.locales, seedFile);
  return {
    brand,
    description,
    origin: workerUrl,
    locales,
  };
}

function updateSeedOrigin(seedFile, workerUrl) {
  const raw = JSON.parse(readFileSync(seedFile, "utf8"));
  raw.origin = workerUrl;
  writeFileSync(seedFile, `${JSON.stringify(raw, null, 2)}\n`);
}

function runSetupSite({ projectName, brand, description, locales, origin }) {
  execFileSync("pnpm", [
    "run",
    "setup:site",
    "--",
    "--project-name",
    projectName,
    "--brand",
    brand,
    "--description",
    description,
    "--locales",
    locales.join(","),
    "--origin",
    origin,
  ], { stdio: "inherit" });
}

function normalizeSeedLocales(input, seedFile) {
  if (!Array.isArray(input)) throw new Error(`${seedFile}: locales must be an array`);
  const locales = input.map((v) => {
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`${seedFile}: locales must contain non-empty strings`);
    }
    return v.trim();
  });
  const unique = [...new Set(locales)];
  if (unique.length === 0) throw new Error(`${seedFile}: locales must not be empty`);
  return unique;
}

function requiredJsonString(input, field) {
  if (typeof input !== "string" || input.trim() === "") throw new Error(`${field} is required`);
  return input.trim();
}

function firstJsonString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function replaceInBlock(text, table, bindingLine, key, value) {
  const header = `[[${table}]]`;
  const start = text.indexOf(`${header}\n${bindingLine}`);
  if (start === -1) throw new Error(`Could not find ${header} with ${bindingLine}`);
  const next = text.indexOf("\n[[", start + header.length);
  const end = next === -1 ? text.length : next;
  const block = text.slice(start, end);
  const rewritten = block.replace(
    new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} = ".*"$`, "m"),
    `${key} = ${JSON.stringify(value)}`,
  );
  if (rewritten === block) throw new Error(`Could not update ${key} in ${bindingLine}`);
  return `${text.slice(0, start)}${rewritten}${text.slice(end)}`;
}

function pipeSecret(name, value) {
  execFileSync("pnpm", ["exec", "wrangler", "secret", "put", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

function printPlan(ctx, names) {
  const callback = `${ctx.workerUrl}/admin/auth/github/callback`;
  console.log(`
==============================================
Provisioning plan for ${names.projectName}
==============================================

Cloudflare account: ${ctx.accountName} (${ctx.accountId})
Worker URL:         ${ctx.workerUrl}

Will create:
  Worker            ${names.worker}
  D1 database       ${names.d1}
  Render KV         ${names.renderKv}
  OAuth KV          ${names.oauthKv}
  Turnstile widget  ${names.turnstile}

Important: these KV names are created through the Cloudflare API,
not through "wrangler kv namespace create". Do not prefix them again.
The OAuth KV must be exactly "${names.oauthKv}", not
"${names.projectName}-${names.oauthKv}".

Before running provision:up, create a GitHub OAuth App:

  1. Open https://github.com/settings/developers → New OAuth App
  2. Fill in:
       Application name:           ${names.projectName}
       Homepage URL:               ${ctx.workerUrl}
       Authorization callback URL: ${callback}
       Enable Device Flow:         leave UNCHECKED
  3. Register application
  4. Copy Client ID. Generate Client Secret. Copy Client Secret.

Then run the safer env-var form so the GitHub Client Secret is not
embedded in shell history or visible command logs:

  read -rsp "GitHub Client Secret: " GITHUB_CLIENT_SECRET && export GITHUB_CLIENT_SECRET && printf "\\n"

  pnpm run provision:up -- \\
    --project-name ${names.projectName} \\
    --github-username <your-github-login> \\
    --client-id <client-id> \\
    --seed-file initial-seed.json

Fallback for automation-only environments: pass --client-secret explicitly.
`);
}

function printHandoff(ctx, names) {
  console.log(`
==============================================
Provision complete
==============================================

Public URL:  ${ctx.workerUrl}
MCP URL:     ${ctx.workerUrl}/mcp
Sign in:     ${ctx.workerUrl}/admin/auth/github

Cloudflare resources are scoped to ${names.projectName}; manage at
https://dash.cloudflare.com/${ctx.accountId}.

Reminder: revoke the CLOUDFLARE_API_TOKEN you used for provisioning at
https://dash.cloudflare.com/profile/api-tokens.
`);
}

function requireToken() {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  return t;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function requireSecretArg(args, key, envKey) {
  const value = args[key] ?? process.env[envKey];
  if (!value) throw new Error(`Missing --${key} or ${envKey}`);
  return value;
}
