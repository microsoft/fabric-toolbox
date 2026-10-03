// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const path = resolve("rayfin", "data", "WorkspaceScope.ts");
const source = ts.createSourceFile(
  path,
  readFileSync(path, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const entity = source.statements.find(ts.isClassDeclaration)!;

function calls(node: ts.ClassDeclaration | ts.PropertyDeclaration) {
  return (ts.getDecorators(node) ?? [])
    .map((decorator) => decorator.expression)
    .filter(ts.isCallExpression);
}

function actions(call: ts.CallExpression): string[] {
  const argument = call.arguments[0];
  if (ts.isStringLiteral(argument)) return [argument.text];
  if (ts.isArrayLiteralExpression(argument)) {
    return argument.elements
      .filter(ts.isStringLiteral)
      .map((element) => element.text);
  }
  throw new Error("Expected explicit permission actions");
}

function policy(call: ts.CallExpression): ts.ArrowFunction | undefined {
  const options = call.arguments[1];
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
  return options.properties
    .filter(ts.isPropertyAssignment)
    .find((property) => property.name.getText() === "policy")
    ?.initializer as ts.ArrowFunction | undefined;
}

describe("workspace scope policy", () => {
  it("shares selected rows but restricts every mutation to the synchronizer", () => {
    const permissions = calls(entity).filter(
      (call) => call.expression.getText() === "authenticated",
    );
    const read = permissions.filter((call) => actions(call).includes("read"));
    expect(read).toHaveLength(1);
    expect(policy(read[0])).toBeUndefined();

    for (const action of ["create", "update", "delete"]) {
      const rule = permissions.find((call) => actions(call).includes(action));
      expect(rule).toBeDefined();
      expect(policy(rule!)?.body.getText(source)).toContain(
        "claims.sub.eq(SYNC_WRITER_SUBJECT)",
      );
    }
    const create = permissions.find((call) => actions(call).includes("create"));
    expect(policy(create!)?.body.getText(source).replace(/\s+/g, "")).toContain(
      "claims.email.eq(item.writerEmail)",
    );
  });

  it("uses the Fabric workspace UUID as the row ID and bounds every text field", () => {
    const fields = entity.members.filter(ts.isPropertyDeclaration);
    const id = fields.find((field) => field.name.getText() === "id")!;
    expect(calls(id)[0].expression.getText()).toBe("uuid");
    for (const field of fields) {
      const decorator = calls(field)[0];
      if (decorator.expression.getText() !== "text") continue;
      const options = decorator.arguments[0] as ts.ObjectLiteralExpression;
      const max = options.properties
        .filter(ts.isPropertyAssignment)
        .find((property) => property.name.getText() === "max")!
        .initializer;
      expect(Number(max.getText())).toBeGreaterThan(0);
      expect(Number(max.getText())).toBeLessThanOrEqual(200);
    }
  });
});
