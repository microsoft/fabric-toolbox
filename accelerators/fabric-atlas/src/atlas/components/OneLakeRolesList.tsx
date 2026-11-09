import type { ItemOneLakeRoles, OneLakeRoleInfo } from "../governance-evidence";
import type { Principal } from "../model";

function tableName(path: string): string {
  if (path === "*") return "All data";
  const trimmed = path.replace(/^\/+/, "");
  const table = trimmed.match(/^Tables\/(.+)$/i);
  return table ? table[1].replace(/\//g, ".") : trimmed;
}

/** Turns `SELECT * FROM t WHERE region = 'EMEA'` into `region = 'EMEA'`. */
function predicateText(predicate: string): string {
  const where = predicate.match(/\bwhere\b([\s\S]+)$/i);
  return (where ? where[1] : predicate).trim();
}

function members(role: OneLakeRoleInfo, names: ReadonlyMap<string, string>): string {
  const resolved = role.memberIds.map((id) => names.get(id.toLowerCase()) ?? names.get(id) ?? id);
  const parts = [...resolved.slice(0, 3)];
  if (resolved.length > 3) parts.push(`+${resolved.length - 3}`);
  if (role.itemMemberCount > 0) parts.push("Workspace viewers");
  return parts.join(", ") || "None";
}

function rows(role: OneLakeRoleInfo): string {
  if (role.rowFilters?.length) return role.rowFilters.map((f) => predicateText(f.predicate)).join("; ");
  return role.rowSecurity ? "Filtered (predicate not collected)" : "none";
}

function columns(role: OneLakeRoleInfo): string {
  if (role.columnRules?.length) {
    return role.columnRules
      .map((rule) => {
        const verb = /^permit$/i.test(rule.effect) ? "allows" : "hides";
        return `${verb} ${rule.columns.length}${rule.columns.length ? `: ${rule.columns.join(", ")}` : ""}`;
      })
      .join("; ");
  }
  return role.columnSecurity ? "Restricted (columns not collected)" : "none";
}

export function OneLakeRolesList({
  value,
  principals = [],
}: {
  value: ItemOneLakeRoles;
  principals?: readonly Principal[];
}) {
  if (!value.known) {
    return (
      <p className="text-200 text-muted-foreground">
        OneLake data access roles: Unknown — the roles API was not available to the synchronizer.
      </p>
    );
  }
  if (value.roles.length === 0) {
    return <p className="text-200 text-muted-foreground">No OneLake data access role recorded for this item.</p>;
  }
  const names = new Map(principals.map((p) => [p.principalId.toLowerCase(), p.displayName]));
  return (
    <div className="grid gap-s">
      <p className="text-200 text-muted-foreground">
        Read from the item&apos;s data access roles. Members, tables, row filters and hidden columns per role.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-200" aria-label="OneLake data access roles">
          <thead className="text-100 uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-s py-xs font-semibold">Role</th>
              <th scope="col" className="px-s py-xs font-semibold">Members</th>
              <th scope="col" className="px-s py-xs font-semibold">Tables</th>
              <th scope="col" className="px-s py-xs font-semibold">Rows (RLS)</th>
              <th scope="col" className="px-s py-xs font-semibold">Columns (CLS)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {value.roles.map((role) => (
              <tr key={role.roleName} className="align-top">
                <th scope="row" className="px-s py-xs font-semibold">{role.roleName}</th>
                <td className="px-s py-xs">{members(role, names)}</td>
                <td className="px-s py-xs">{role.paths.map(tableName).join(", ") || "None"}</td>
                <td className="px-s py-xs">{rows(role)}</td>
                <td className="px-s py-xs">{columns(role)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
