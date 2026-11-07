import { describe, expect, it } from "vitest";
import { accessRowsToCsv } from "./access-export";
import {
  countPrincipalTypes,
  matchesAccessFilters,
  parsePrincipalTypeFilter,
  parseRoleFilter,
  principalTypeOf,
} from "./access-filters";
import { buildAccessReviewRows } from "./governance";
import type { AccessReviewRow } from "./governance";
import type { Grant, Principal } from "./model";

function row(
  key: string,
  principal: Partial<Principal> | undefined,
  grants: Partial<Grant>[],
  overrides: Partial<AccessReviewRow> = {},
): AccessReviewRow {
  return {
    id: key,
    principalKey: key,
    principalRef: principal?.email ?? key,
    principalResolution: principal ? "resolved" : "unresolved",
    principal: principal as Principal | undefined,
    applicableGrants: grants as Grant[],
    flags: [],
    ...overrides,
  } as AccessReviewRow;
}

const admin = row("u1", { kind: "user", email: "ana@contoso.com" }, [{ source: "workspaceRole", roleName: "Admin" }]);
const group = row("g1", { kind: "group" }, [{ source: "workspaceRole", roleName: "Viewer" }]);
const app = row("sp1", { kind: "servicePrincipal" }, [{ source: "directShare", itemFabricId: "item-1" }], {
  flags: ["servicePrincipal"],
});
const guest = row("u2", { kind: "user", email: "bob_fabrikam.com#EXT#@contoso.onmicrosoft.com" }, [
  { source: "workspaceRole", roleName: "Member" },
]);
const unresolved = row("x", undefined, [{ source: "workspaceRole", roleName: "Contributor" }]);

describe("access filters", () => {
  it("classifies principal types, with guests detected heuristically", () => {
    expect([admin, group, app, guest, unresolved].map(principalTypeOf)).toEqual([
      "user",
      "group",
      "servicePrincipal",
      "guest",
      "unknown",
    ]);
  });

  it("filters by principal type and role together", () => {
    const rows = [admin, group, app, guest, unresolved];
    expect(rows.filter((entry) => matchesAccessFilters(entry, "all", "item"))).toEqual([app]);
    expect(rows.filter((entry) => matchesAccessFilters(entry, "user", "Admin"))).toEqual([admin]);
    expect(rows.filter((entry) => matchesAccessFilters(entry, "user", "Member"))).toEqual([]);
    expect(rows.filter((entry) => matchesAccessFilters(entry, "guest", "Member"))).toEqual([guest]);
  });

  it("counts distinct principals per type and rejects unknown filter values", () => {
    expect(countPrincipalTypes([admin, { ...admin, id: "u1b" }, guest, unresolved])).toEqual({
      user: 1,
      group: 0,
      servicePrincipal: 0,
      guest: 1,
      unknown: 1,
    });
    expect(parsePrincipalTypeFilter("robot")).toBe("all");
    expect(parseRoleFilter("Owner")).toBe("all");
    expect(parseRoleFilter("item")).toBe("item");
  });

  it("exports the principal type and roles of the filtered rows", async () => {
    const { SAMPLE_DATA } = await import("./model");
    const rows = buildAccessReviewRows(SAMPLE_DATA).filter((entry) => matchesAccessFilters(entry, "all", "Admin"));
    const [header, ...lines] = accessRowsToCsv(rows).split("\r\n");
    expect(header).toContain('"Resolution","Principal type","Roles"');
    expect(lines).toHaveLength(rows.length);
    for (const line of lines) expect(line).toContain("Admin");
  });
});
