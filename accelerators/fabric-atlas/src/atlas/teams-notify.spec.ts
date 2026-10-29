import { describe, expect, it } from "vitest";
import { criticalFindingKey, parseGovernanceSummary, summarizeGovernance } from "./domain-governance";
import type { GovernanceFinding } from "./governance";
import { SAMPLE_DATA } from "./model";
import { buildNewCriticalCard, newCriticalFindings } from "./teams-notify";
import { parseTeamsCard, postTeamsCard, validWebhookUrl } from "../../rayfin/functions/src/teams-notify";

const finding = (id: string, severity: GovernanceFinding["severity"] = "critical"): GovernanceFinding => ({
  id, severity, category: "access", title: `Finding ${id}`, detail: "", recommendation: "", evidenceIds: [],
});

describe("Teams notification for new critical findings", () => {
  it("only reports critical findings absent from the previous snapshot", () => {
    const previous = JSON.stringify({ ...summarizeGovernance(SAMPLE_DATA), critical: [criticalFindingKey("old")] });
    const fresh = newCriticalFindings([finding("old"), finding("new"), finding("hi", "high")], previous);
    expect(fresh.map((entry) => entry.id)).toEqual(["new"]);
  });

  it("never notifies without a previous summary (first sync)", () => {
    expect(newCriticalFindings([finding("new")], undefined)).toEqual([]);
  });

  it("stores and parses critical keys in the persisted governance summary", () => {
    const summary = summarizeGovernance(SAMPLE_DATA);
    const parsed = parseGovernanceSummary(JSON.stringify(summary));
    expect(parsed?.critical ?? []).toEqual(summary.critical ?? []);
    expect(JSON.stringify(summary).length).toBeLessThan(4000);
  });

  it("builds a single card listing the new critical findings", () => {
    const card = buildNewCriticalCard(SAMPLE_DATA, [finding("a"), finding("b")]);
    expect(card.type).toBe("AdaptiveCard");
    expect(JSON.stringify(card.body)).toContain("2 new critical findings since the previous sync");
    expect(card.body[2]).toMatchObject({ text: "Open findings: 2 (2 critical)" });
    expect(JSON.stringify(card.body)).not.toContain("Governance posture");
    expect(card.body.filter((block) => block.text?.includes("**CRITICAL**"))).toHaveLength(2);
  });
});

describe("teamsNotify function", () => {
  const card = JSON.stringify({ type: "AdaptiveCard", version: "1.5", body: [] });

  it("reports not-configured without a secret and never calls out", async () => {
    let called = false;
    const result = await postTeamsCard(undefined, card, (async () => { called = true; return new Response(); }) as typeof fetch);
    expect(result).toEqual({ status: "not-configured" });
    expect(called).toBe(false);
  });

  it("accepts only https webhooks and adaptive cards", () => {
    expect(validWebhookUrl("http://example.test/hook")).toBeUndefined();
    expect(validWebhookUrl("https://user:pw@example.test/hook")).toBeUndefined();
    expect(validWebhookUrl("https://example.test/hook")?.hostname).toBe("example.test");
    expect(parseTeamsCard(JSON.stringify({ type: "Other" }))).toBeUndefined();
    expect(parseTeamsCard("x".repeat(30_000))).toBeUndefined();
  });

  it("posts the card as a Teams message attachment and hides the URL from the result", async () => {
    let body = "";
    const result = await postTeamsCard("https://example.test/hook", card, (async (_url: unknown, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(null, { status: 202 });
    }) as typeof fetch);
    expect(result).toEqual({ status: "sent", httpStatus: 202 });
    expect(JSON.parse(body).attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(JSON.stringify(result)).not.toContain("example.test");
  });
});
