import { describe, expect, it } from "vitest";
import { parseAtlasLocation, urlForNavigation } from "./routing";

describe("Atlas routing", () => {
  it("round-trips namespaced governance state", () => {
    const url = urlForNavigation(
      { pathname: "/", search: "?ctid=tenant" },
      {
        tab: "governance",
        focus: {
          requestId: "ignored",
          governanceSection: "findings",
          filters: {
            section: "findings",
            search: "external access",
            category: "access",
            currentSnapshotId: "current",
            previousSnapshotId: "baseline",
          },
        },
      },
    );

    expect(url).toBe(
      "/?ctid=tenant&governance.section=findings&governance.q=external+access&governance.category=access&governance.current=current&governance.baseline=baseline#governance",
    );
    expect(
      parseAtlasLocation({
        hash: "#governance",
        search: url.slice(url.indexOf("?"), url.indexOf("#")),
      }),
    ).toMatchObject({
      tab: "governance",
      focus: {
        governanceSection: "findings",
        filters: {
          section: "findings",
          search: "external access",
          category: "access",
          currentSnapshotId: "current",
          previousSnapshotId: "baseline",
        },
      },
    });
  });

  it("canonicalizes legacy workspace and sensitivity routes", () => {
    expect(
      parseAtlasLocation({ hash: "#comments", search: "" }),
    ).toMatchObject({
      tab: "workspace",
      focus: { workspaceSection: "notes" },
    });
    expect(
      parseAtlasLocation({ hash: "#sensitivity", search: "" }),
    ).toMatchObject({
      tab: "governance",
      focus: { governanceSection: "coverage" },
    });
  });

  it("preserves unrelated host parameters and removes stale Atlas state", () => {
    expect(
      urlForNavigation(
        {
          pathname: "/app",
          search:
            "?ctid=tenant&catalog.q=old&access.risk=external&custom=value",
        },
        {
          tab: "jobs",
          focus: {
            requestId: "ignored",
            filters: { status: "failed" },
          },
        },
      ),
    ).toBe("/app?ctid=tenant&custom=value&jobs.status=failed#jobs");
  });

  it("drops invalid enum values instead of poisoning view state", () => {
    expect(
      parseAtlasLocation({
        hash: "#access",
        search: "?access.mode=unknown&access.risk=invalid",
      }),
    ).toEqual({ tab: "access" });
  });

  it("keeps Asset Catalog filters separate from the selected object kind", () => {
    const url = urlForNavigation(
      { pathname: "/", search: "" },
      {
        tab: "assets",
        focus: {
          requestId: "ignored",
          itemId: "model",
          tableName: "Sales",
          objectName: "Revenue",
          objectKind: "measure",
          query: "rev",
          filters: { kind: "table" },
        },
      },
    );
    const parsed = parseAtlasLocation({
      hash: "#assets",
      search: url.slice(url.indexOf("?"), url.indexOf("#")),
    });

    expect(parsed).toMatchObject({
      tab: "assets",
      focus: {
        objectKind: "measure",
        query: "rev",
        filters: { kind: "table" },
      },
    });
  });

  it("round-trips new object kinds and stable object IDs", () => {
    const url = urlForNavigation(
      { pathname: "/", search: "?ctid=tenant" },
      {
        tab: "assets",
        focus: {
          requestId: "ignored",
          itemId: "graph",
          tableName: "Device",
          objectName: "Device ID",
          objectId: "Device/DeviceId",
          objectKind: "graphProperty",
          filters: { kind: "graphProperty" },
        },
      },
    );

    expect(
      parseAtlasLocation({
        hash: "#assets",
        search: url.slice(url.indexOf("?"), url.indexOf("#")),
      }),
    ).toMatchObject({
      tab: "assets",
      focus: {
        itemId: "graph",
        objectId: "Device/DeviceId",
        objectKind: "graphProperty",
        filters: { kind: "graphProperty" },
      },
    });
  });

  it("round-trips posture filters", () => {
    const url = urlForNavigation(
      { pathname: "/", search: "" },
      {
        tab: "governance",
        focus: {
          requestId: "ignored",
          governanceSection: "posture",
          filters: { section: "posture", pillar: "ownership" },
        },
      },
    );

    expect(url).toContain("governance.section=posture");
    expect(url).toContain("governance.pillar=ownership");
    expect(
      parseAtlasLocation({
        hash: "#governance",
        search: url.slice(url.indexOf("?"), url.indexOf("#")),
      }),
    ).toMatchObject({
      focus: {
        governanceSection: "posture",
        filters: { pillar: "ownership" },
      },
    });
  });
});
