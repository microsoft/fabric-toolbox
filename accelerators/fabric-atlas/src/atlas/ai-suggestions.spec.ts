import { describe, expect, it, vi } from "vitest";
import { buildDescriptionPrompt, suggestionsToCsv } from "./ai-suggestions";
import type { CatalogObject } from "./catalog-objects";
import {
  parseModelSuggestions,
  requestSuggestions,
} from "../../rayfin/functions/src/ai-suggest";

function obj(partial: Partial<CatalogObject> & Pick<CatalogObject, "id" | "name" | "kind">): CatalogObject {
  return {
    objectId: partial.id,
    itemFabricId: "item-1",
    itemName: "Sales model",
    itemType: "SemanticModel",
    details: {},
    ...partial,
  } as CatalogObject;
}

const table = obj({ id: "t", name: "Sales", kind: "table" });
const assets = [
  table,
  obj({ id: "c", name: "Amount", kind: "column", tableName: "Sales", dataType: "Decimal" }),
  obj({ id: "m", name: "Total Sales", kind: "measure", tableName: "Sales", expression: "SUM ( Sales[Amount] )" }),
  obj({ id: "x", name: "Other", kind: "column", tableName: "Customers" }),
];

const ok = { enabled: "true", endpoint: "https://ai.example.com/chat", apiKey: "k" };
const request = JSON.stringify({ prompt: "p", targets: ["Sales"] });

describe("AI description suggestions", () => {
  it("builds a prompt with names, schema and DAX of the selected object only", () => {
    const result = buildDescriptionPrompt(table, assets);
    expect(result.targets).toEqual(["Sales", "Amount", "Total Sales"]);
    expect(result.prompt).toContain("SUM ( Sales[Amount] )");
    expect(result.prompt).toContain("Decimal");
    expect(result.prompt).not.toContain("Other");
    expect(result.truncated).toBe(false);
  });

  it("truncates large schemas to the target limit", () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      obj({ id: `c${i}`, name: `Col${i}`, kind: "column", tableName: "Sales" }),
    );
    const result = buildDescriptionPrompt(table, [table, ...many]);
    expect(result.targets).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("exports CSV flagged AI-generated and neutralizes formulas", () => {
    const csv = suggestionsToCsv(table, [{ target: "Sales", suggestion: "=cmd" }]);
    expect(csv.split("\r\n")[0]).toContain("Suggested description");
    expect(csv).toContain('"AI-generated"');
    expect(csv).toContain(`"'=cmd"`);
  });

  it("is disabled by default and never calls the endpoint", async () => {
    const fetcher = vi.fn();
    expect(await requestSuggestions({ endpoint: ok.endpoint, apiKey: "k" }, request, fetcher as never)).toEqual({ status: "disabled" });
    expect(await requestSuggestions({ enabled: "true", apiKey: "k" }, request, fetcher as never)).toEqual({ status: "not-configured" });
    expect(await requestSuggestions({ ...ok, endpoint: "http://insecure" }, request, fetcher as never)).toEqual({ status: "not-configured" });
    expect(await requestSuggestions(ok, "{}", fetcher as never)).toEqual({ status: "invalid-request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns only suggestions for requested targets", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"suggestions":[{"target":"Sales","suggestion":"Sales facts"},{"target":"Hack","suggestion":"x"}]}\n```' } }],
        }),
        { status: 200 },
      ),
    );
    const result = await requestSuggestions(ok, request, fetcher as never);
    expect(result).toEqual({ status: "ok", suggestions: [{ target: "Sales", suggestion: "Sales facts" }] });
    const init = (fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1];
    expect((init.headers as Record<string, string>)["api-key"]).toBe("k");
  });

  it("reports failures without leaking details", async () => {
    const failing = vi.fn(async () => new Response("nope", { status: 429 }));
    expect(await requestSuggestions(ok, request, failing as never)).toEqual({ status: "failed", httpStatus: 429 });
    const throwing = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await requestSuggestions(ok, request, throwing as never)).toEqual({ status: "failed" });
    expect(parseModelSuggestions("not json", ["Sales"])).toBeUndefined();
  });

  it("uses Entra client credentials when configured", async () => {
    const fetcher = vi.fn(async (url: string | URL) =>
      String(url).includes("login.microsoftonline.com")
        ? new Response(JSON.stringify({ access_token: "tok" }), { status: 200 })
        : new Response(JSON.stringify({ choices: [{ message: { content: '{"suggestions":[]}' } }] }), { status: 200 }),
    );
    const result = await requestSuggestions(
      { enabled: "true", endpoint: ok.endpoint, tenantId: "t", clientId: "c", clientSecret: "s" },
      request,
      fetcher as never,
    );
    expect(result).toEqual({ status: "ok", suggestions: [] });
    const init = (fetcher.mock.calls[1] as unknown as [URL, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
});
