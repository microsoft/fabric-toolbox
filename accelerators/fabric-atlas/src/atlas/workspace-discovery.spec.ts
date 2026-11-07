// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  authorizeWorkspaceDiscovery,
  discoverFabricWorkspaces,
} from "../../rayfin/functions/src/workspace-discovery";

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("workspace discovery function", () => {
  it("binds the Fabric audience without exposing request parameters", () => {
    const metadata = JSON.parse(
      readFileSync(
        resolve("rayfin", "functions", "runtimemetadata.json"),
        "utf8",
      ),
    ) as {
      functions: {
        functionName: string;
        contextAudiences: string[];
        delegateParameters: { name: string; type: string }[];
      }[];
    };
    const fn = metadata.functions.find(
      (candidate) => candidate.functionName === "workspaceDiscover",
    );
    expect(fn).toMatchObject({
      contextAudiences: ["Fabric"],
      delegateParameters: [
        {
          name: "ctx",
          type: "RayfinContext<AtlasSchema, AudienceType.Fabric>",
        },
      ],
    });
  });

  it("fails closed when the caller cannot read administrator-only rows", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("forbidden"));
    await expect(
      authorizeWorkspaceDiscovery({
        SynchronizerAuthority: {
          findById: execute,
          create: vi.fn(),
        },
      }),
    ).rejects.toThrow("configured Atlas administrator");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("paginates, deduplicates and returns only bounded identity fields", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          value: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              displayName: "Workspace B",
              description: "must not escape",
              type: "Workspace",
            },
          ],
          continuationUri:
            "https://api.fabric.microsoft.com/v1/workspaces?continuationToken=next",
        }),
      )
      .mockResolvedValueOnce(
        response({
          value: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              displayName: "Workspace A",
              type: "Workspace",
              capacityId: "33333333-3333-4333-8333-333333333333",
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              displayName: "Workspace B renamed",
              type: "Workspace",
            },
          ],
        }),
      );

    const result = await discoverFabricWorkspaces("token", fetchImpl);

    expect(result).toEqual({
      contractVersion: 1,
      truncated: false,
      workspaces: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "Workspace A",
          workspaceType: "Workspace",
          capacityId: "33333333-3333-4333-8333-333333333333",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          displayName: "Workspace B renamed",
          workspaceType: "Workspace",
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result.workspaces)).not.toContain("must not escape");
  });

  it("retries throttled Fabric pages without returning the error body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          { error: { message: "private upstream detail" } },
          { status: 429, headers: { "retry-after": "0" } },
        ),
      )
      .mockResolvedValueOnce(response({ value: [] }));

    await expect(
      discoverFabricWorkspaces("token", fetchImpl),
    ).resolves.toMatchObject({ workspaces: [], truncated: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects cross-origin continuations and malformed workspace IDs", async () => {
    await expect(
      discoverFabricWorkspaces(
        "token",
        vi.fn<typeof fetch>().mockResolvedValue(
          response({
            value: [],
            continuationUri: "https://example.test/v1/workspaces?next=1",
          }),
        ),
      ),
    ).rejects.toThrow("invalid continuation URL");

    await expect(
      discoverFabricWorkspaces(
        "token",
        vi.fn<typeof fetch>().mockResolvedValue(
          response({
            value: [{ id: "not-a-uuid", displayName: "Broken" }],
          }),
        ),
      ),
    ).rejects.toThrow("invalid workspace");
  });
});
