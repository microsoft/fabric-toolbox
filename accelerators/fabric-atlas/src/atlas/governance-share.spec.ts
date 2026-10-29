import { describe, expect, it } from "vitest";
import type { GovernanceFinding } from "./governance";
import {
  buildFindingsExport,
  buildTeamsPostureCard,
  isFindingOwnedBy,
  TEAMS_CARD_TOP_FINDINGS,
} from "./governance-share";
import type { AtlasData } from "./model";

const WS = "11111111-2222-4333-8444-555555555555";
const ITEM = "66666666-7777-4888-9999-aaaaaaaaaaaa";

const data: Pick<AtlasData, "workspace" | "items"> = {
  workspace: { fabricId: WS, displayName: "Sales", capacity: "F2", region: "West Europe" },
  items: [
    {
      fabricId: ITEM,
      displayName: "Gold",
      itemType: "Lakehouse",
      health: "healthy",
      endorsement: "certified",
      tags: [],
      ownerName: "Ada",
      ownerEmail: "Ada@Contoso.com",
    },
  ],
};

function finding(
  id: string,
  severity: GovernanceFinding["severity"],
  itemId?: string,
): GovernanceFinding {
  return {
    id,
    severity,
    category: "metadata",
    title: `Title ${id}`,
    detail: "detail",
    recommendation: "fix it",
    itemId,
    target: itemId ? { kind: "item", itemId } : { kind: "workspace" },
    evidenceIds: [],
  } as GovernanceFinding;
}

describe("governance sharing", () => {
  it("matches My items on the owner email only, case-insensitively", () => {
    const owned = finding("missing-description:a", "low", ITEM);
    expect(isFindingOwnedBy(owned, data.items, " ada@contoso.com ")).toBe(true);
    expect(isFindingOwnedBy(owned, data.items, "Ada")).toBe(false);
    expect(isFindingOwnedBy(owned, data.items, undefined)).toBe(false);
    expect(isFindingOwnedBy(finding("workspace-no-domain:w", "low"), data.items, "ada@contoso.com")).toBe(false);
  });

  it("exports findings sorted by severity with fix links and pillars", () => {
    const exported = buildFindingsExport(
      [
        finding("missing-description:a", "low", ITEM),
        finding("certified-missing-sensitivity:a", "high", ITEM),
      ],
      data,
      "2026-10-17T00:00:00.000Z",
    );
    expect(exported.count).toBe(2);
    expect(exported.findings.map((entry) => entry.rule)).toEqual([
      "certified-missing-sensitivity",
      "missing-description",
    ]);
    expect(exported.findings[0].fabricPillar).toBe("protect");
    expect(exported.findings[0].item?.owner).toBe("Ada@Contoso.com");
    expect(exported.findings[0].fixUrl).toContain(`/lakehouses/${ITEM}`);
  });

  it("builds a Teams Adaptive Card capped to the top findings", () => {
    const findings = Array.from({ length: 7 }, (_, index) =>
      finding(`rule-${index}:x`, index === 6 ? "critical" : "low"),
    );
    const card = buildTeamsPostureCard(
      { global: 72, pillars: [{ pillar: "ownership", score: 80, target: 90 }] as never },
      findings,
      data,
      "https://atlas.example",
    );
    const lines = card.body.filter(
      (block) => block.type === "TextBlock" && String(block.text).startsWith("- "),
    );
    expect(card.version).toBe("1.5");
    expect(lines).toHaveLength(TEAMS_CARD_TOP_FINDINGS);
    expect(String(lines[0].text)).toContain("CRITICAL");
    expect(card.actions?.[0].url).toBe("https://atlas.example");
  });
});
