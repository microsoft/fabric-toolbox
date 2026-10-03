// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectWorkspacePolicyEvidence, POLICY_COLLECT_LIMITS, workspaceCollectAccessPolicyEvidence,
} from "../../rayfin/functions/src/workspace-policy-evidence";
import {
  parseAccessPolicyEvidence, POLICY_IDENTITY, POLICY_SOURCE,
} from "../../rayfin/functions/src/policy-evidence-contract";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";

const W = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const EMAIL = "sync@example.test";
const TOKEN = "SECRET_BEARER";
const responses = () => [
  { inbound: { publicAccessRules: { defaultAction: "Deny" } }, outbound: { publicAccessRules: { defaultAction: "Allow" } },
    token: TOKEN, businessRows: [{ secret: TOKEN }], oneLakeRole: "Invented", dlp: "Restricted" },
  { defaultAction: "Deny", token: TOKEN },
];
function transport() {
  const values = responses();
  return vi.fn(async () => new Response(JSON.stringify(values.shift()), { status: 200 }));
}
function context() {
  const query = {
    where: vi.fn().mockReturnThis(), first: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([{ id: S, fabricId: W, snapshotId: S, writerEmail: EMAIL }]),
  };
  const data = {
    SynchronizerAuthority: {
      findById: vi.fn().mockResolvedValue({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() }),
      create: vi.fn(),
    },
    Workspace: { select: vi.fn().mockReturnValue(query) },
    AccessPolicyEvidence: { create: vi.fn().mockImplementation(async (record) => record) },
  };
  const getToken = vi.fn(() => TOKEN);
  const tokens = Object.defineProperty({}, "Fabric", { get: getToken });
  const ctx = { getDataClient: vi.fn(() => data), Tokens: tokens } as unknown as Parameters<typeof workspaceCollectAccessPolicyEvidence>[0];
  return { ctx, data, query, getToken };
}
afterEach(() => vi.unstubAllEnvs());

describe("verified workspace policy context adapter", () => {
  it("uses only two fixed GETs, projects allowlisted settings and never calls a guessed evaluator", async () => {
    const fetch = transport();
    const records = await collectWorkspacePolicyEvidence(TOKEN, W, S, EMAIL, { fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      `https://api.fabric.microsoft.com/v1/workspaces/${W}/networking/communicationPolicy`,
      `https://api.fabric.microsoft.com/v1/workspaces/${W}/networking/communicationPolicy/inbound/externalDataShares`,
    ]);
    for (const call of fetch.mock.calls) {
      const options = (call as unknown[])[1] as RequestInit;
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("manual");
    }
    expect(records[0]).toMatchObject({ coverage: "observed", inboundPublicAction: "Deny", outboundPublicAction: "Allow" });
    expect(records[1]).toMatchObject({ coverage: "observed", externalSharesBypassAction: "Deny" });
    expect(records[2]).toMatchObject({ coverage: "unsupported", reason: "evaluation-contract-unverified" });
    expect(records[0].observedAt).toBeDefined();
    expect(records[2].observedAt).toBeUndefined();
    expect(JSON.stringify(records)).not.toMatch(/SECRET_BEARER|businessRows|oneLakeRole|"dlp"|matchedRule|decision/);
    records.forEach((record) => expect(parseAccessPolicyEvidence(record, W, S)).toEqual(record));
  });

  it("does not apply the PUT default-Allow rule to missing GET fields", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ inbound: { publicAccessRules: { defaultAction: "Deny" } } })));
    const records = await collectWorkspacePolicyEvidence(TOKEN, W, S, EMAIL, { fetch });
    expect(records[0]).toMatchObject({ coverage: "partial", reason: "missing-setting", inboundPublicAction: "Deny" });
    expect(records[0].outboundPublicAction).toBeUndefined();
    expect(records[1]).toMatchObject({ coverage: "unavailable", reason: "malformed-response" });
    expect(records[1].observedAt).toBeUndefined();
  });

  it.each([401, 403, 404, 405, 429, 500])("records HTTP %s without leaking the upstream body", async (status) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: TOKEN }), { status }));
    const records = await collectWorkspacePolicyEvidence(TOKEN, W, S, EMAIL, { fetch, sleep: async () => undefined });
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(POLICY_COLLECT_LIMITS.maxRequests);
    expect(records[0].coverage).toBe([401, 403].includes(status) ? "denied" :
      [404, 405].includes(status) ? "unsupported" : "unavailable");
    expect(records[0].observedAt).toBeUndefined();
    expect(JSON.stringify(records)).not.toContain(TOKEN);
  });

  it("bounds response bytes and rejects redirects without following them", async () => {
    const oversized = vi.fn(async () => new Response(JSON.stringify({ large: TOKEN.repeat(5000) })));
    const records = await collectWorkspacePolicyEvidence(TOKEN, W, S, EMAIL, { fetch: oversized });
    expect(records[0].coverage).toBe("unavailable");
    expect(JSON.stringify(records)).not.toContain(TOKEN);
    const redirected = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://example.com/secret" } }));
    await collectWorkspacePolicyEvidence(TOKEN, W, S, EMAIL, { fetch: redirected });
    expect(redirected).toHaveBeenCalledTimes(2);
  });

  it("is off by default before authority, token, network or evidence writes", async () => {
    vi.stubEnv("RAYFIN_ATLAS_FEATURE_FABRIC_POLICIES", "");
    const { ctx, data, getToken } = context();
    const fetch = transport();
    expect(await workspaceCollectAccessPolicyEvidence(ctx, 1, W, S, { fetch }))
      .toEqual({ status: "off", records: 0 });
    expect(ctx.getDataClient).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(data.AccessPolicyEvidence.create).not.toHaveBeenCalled();
  });

  it("checks synchronizer authority and snapshot affinity before acquiring a token", async () => {
    const { ctx, data, query, getToken } = context();
    data.SynchronizerAuthority.findById.mockResolvedValue(null);
    data.SynchronizerAuthority.create.mockRejectedValue(new Error(TOKEN));
    const fetch = transport();
    await expect(workspaceCollectAccessPolicyEvidence(ctx, 1, W, S, { enabled: true, fetch }))
      .rejects.toThrow("configured synchronizer");
    expect(getToken).not.toHaveBeenCalled();
    data.SynchronizerAuthority.findById.mockResolvedValue({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() });
    query.execute.mockResolvedValue([{ id: S, fabricId: S, snapshotId: S, writerEmail: EMAIL }]);
    await expect(workspaceCollectAccessPolicyEvidence(ctx, 1, W, S, { enabled: true, fetch }))
      .rejects.toThrow("published snapshot");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists three bounded observations with trusted writer and independent observation times", async () => {
    const { ctx, data, query } = context();
    const result = await workspaceCollectAccessPolicyEvidence(ctx, 1, W, S, { enabled: true, fetch: transport() });
    expect(result).toEqual({ status: "stored", records: 3 });
    expect(query.where).toHaveBeenCalledWith({ fabricId: W, snapshotId: S });
    expect(query.first).toHaveBeenCalledWith(1);
    expect(data.AccessPolicyEvidence.create).toHaveBeenCalledTimes(3);
    for (const [record] of data.AccessPolicyEvidence.create.mock.calls) {
      expect(record).toMatchObject({ workspace_id: W, snapshotId: S, writerEmail: EMAIL,
        source: POLICY_SOURCE, collectorIdentity: POLICY_IDENTITY });
      expect(record.attemptedAt).toBeInstanceOf(Date);
      if (record.coverage === "observed") expect(record.observedAt).toBeInstanceOf(Date);
      else expect(record.observedAt).toBeUndefined();
    }
  });

  it("isolates persistence failures from the required catalog", async () => {
    const { ctx, data } = context();
    data.AccessPolicyEvidence.create.mockRejectedValue(new Error(TOKEN));
    await expect(workspaceCollectAccessPolicyEvidence(ctx, 1, W, S, { enabled: true, fetch: transport() }))
      .rejects.toThrow("catalog was not changed");
    expect(data.Workspace.select).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid IDs before a request and never manufactures observations when token is absent", async () => {
    const fetch = transport();
    await expect(collectWorkspacePolicyEvidence(TOKEN, "../escape", S, EMAIL, { fetch })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const records = await collectWorkspacePolicyEvidence(undefined, W, S, EMAIL, { fetch });
    expect(records[0].reason).toBe("token-unavailable");
    expect(records.every((record) => !record.observedAt)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("additive policy evidence entity permissions", () => {
  it("shares app-audience reads but restricts every write to the immutable synchronizer", () => {
    const entity = readFileSync(resolve("rayfin", "data", "AccessPolicyEvidence.ts"), "utf8");
    expect(entity).toContain("@authenticated('read')");
    expect(entity).toContain("claims.sub.eq(SYNC_WRITER_SUBJECT).and(claims.email.eq(item.writerEmail))");
    expect(entity).toContain("@authenticated('delete', { policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT) })");
    expect(entity).not.toMatch(/authenticated\('update'|anonymous|accessToken|businessRows|principalId|decision/);
    expect(entity).toContain("@date({ optional: true }) observedAt?");
    const schema = readFileSync(resolve("rayfin", "data", "schema.ts"), "utf8");
    expect(schema).toContain("AccessPolicyEvidence: AccessPolicyEvidence;");
    expect(schema).toContain("  AccessPolicyEvidence,");
  });
});
