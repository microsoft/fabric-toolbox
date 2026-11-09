import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "./ui";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe("UI class contract", () => {
  it("uses the compact shared header on every main screen", () => {
    const root = resolve(process.cwd(), "src", "atlas", "views");
    for (const view of ["Overview", "Map", "Catalog", "AssetCatalog", "GovernanceCenter", "Access", "Jobs", "WorkspaceHub", "About", "Sensitivity", "Config", "Comments"]) {
      expect(readFileSync(join(root, `${view}.tsx`), "utf8"), view).toContain("<PageHeader");
    }
  });
  it("keeps active-workspace switching in the global selector, not page bodies", () => {
    const root = resolve(process.cwd(), "src", "atlas");
    const bodies = [
      ...sourceFiles(join(root, "views")).filter((file) => !file.endsWith("FirstSync.tsx")),
      join(root, "components", "WorkspaceSynchronizationPanel.tsx"),
    ];
    for (const file of bodies) {
      expect(readFileSync(file, "utf8"), relative(root, file)).not.toMatch(/<WorkspaceSelector|useWorkspaceSwitch|selectWorkspace\(/);
    }
  });
  it("keeps the custom type scale next to a text colour", () => {
    expect(cn("rounded-md text-200 font-semibold", "text-foreground")).toBe(
      "rounded-md text-200 font-semibold text-foreground",
    );
    expect(cn("text-200 text-muted-foreground", "text-300")).toBe(
      "text-muted-foreground text-300",
    );
  });

  it("never sizes containers with the xs/xl keys that collide with spacing tokens", () => {
    const root = resolve(process.cwd(), "src");
    const offenders = sourceFiles(root).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/\b(?:max-w|min-w|basis)-(?:xs|xl)\b/g)].map(
        (match) => `${relative(root, file)}: ${match[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });
});
