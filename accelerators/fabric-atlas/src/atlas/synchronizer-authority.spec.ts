// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  requireAtlasSynchronizer,
  SYNCHRONIZER_AUTHORITY_ID,
  SynchronizerAuthorizationError,
} from "../../rayfin/functions/src/synchronizer-gate";

describe("synchronizer authority gate", () => {
  it("accepts an existing policy-visible sentinel without a mutation", async () => {
    const create = vi.fn();
    await expect(
      requireAtlasSynchronizer(
        {
          SynchronizerAuthority: {
            findById: vi.fn(async () => ({
              id: SYNCHRONIZER_AUTHORITY_ID,
              createdAt: new Date(),
            })),
            create,
          },
        },
        "test operation",
        "denied",
      ),
    ).resolves.toBeUndefined();
    expect(create).not.toHaveBeenCalled();
  });

  it("bootstraps the sentinel through the protected create policy", async () => {
    const findById = vi.fn(async () => null);
    const create = vi.fn(async () => ({
      id: SYNCHRONIZER_AUTHORITY_ID,
      createdAt: new Date(),
    }));
    await expect(
      requireAtlasSynchronizer(
        { SynchronizerAuthority: { findById, create } },
        "test operation",
        "denied",
      ),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith({
      id: SYNCHRONIZER_AUTHORITY_ID,
      createdAt: expect.any(Date),
    });
  });

  it("recovers a concurrent sentinel create through read-back", async () => {
    const findById = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: SYNCHRONIZER_AUTHORITY_ID,
        createdAt: new Date(),
      });
    const create = vi.fn(async () => {
      throw new Error("unique constraint");
    });
    await expect(
      requireAtlasSynchronizer(
        { SynchronizerAuthority: { findById, create } },
        "test operation",
        "denied",
      ),
    ).resolves.toBeUndefined();
    expect(findById).toHaveBeenCalledTimes(2);
  });

  it("fails closed when policy filtering hides the sentinel", async () => {
    const findById = vi.fn(async () => null);
    const create = vi.fn(async () => {
      throw new Error("forbidden");
    });
    await expect(
      requireAtlasSynchronizer(
        { SynchronizerAuthority: { findById, create } },
        "workspace collection",
        "fixed denial",
      ),
    ).rejects.toThrow("fixed denial");
    expect(findById).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-synchronizer with an explicit 403-style error", async () => {
    const error = await requireAtlasSynchronizer(
      {
        SynchronizerAuthority: {
          findById: vi.fn(async () => {
            throw new Error("policy denied");
          }),
          create: vi.fn(),
        },
      },
      "workspace collection",
      "Workspace collection requires the configured Atlas administrator.",
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SynchronizerAuthorizationError);
    expect(error).toMatchObject({
      code: "NOT_AUTHORIZED",
      status: 403,
      message: "Workspace collection requires the configured Atlas administrator.",
    });
  });
});

describe("application-identity token reads", () => {
  const functionsRoot = resolve("rayfin", "functions", "src");
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? sources(join(dir, entry.name))
        : entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
          ? [join(dir, entry.name)]
          : [],
    );

  it("are always preceded by the synchronizer gate in the same function", () => {
    const reads: string[] = [];
    const ungated: string[] = [];
    for (const path of sources(functionsRoot)) {
      const text = readFileSync(path, "utf8");
      const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === "Tokens" &&
          node.expression.getText(file) === "ctx"
        ) {
          let owner: ts.Node | undefined = node.parent;
          while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
          const before = owner
            ? text.slice(owner.getStart(file), node.getStart(file))
            : "";
          const label = `${path.slice(functionsRoot.length + 1)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
          reads.push(label);
          if (!/await\s+(requireAtlasSynchronizer|authorize\w*)\(/.test(before)) {
            ungated.push(label);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(reads.length).toBeGreaterThan(5);
    expect(ungated).toEqual([]);
  });
});

describe("SynchronizerAuthority policy", () => {
  it("restricts every action to the configured synchronizer subject", () => {
    const path = resolve("rayfin", "data", "SynchronizerAuthority.ts");
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const entity = source.statements.find(ts.isClassDeclaration)!;
    const decorators = (ts.getDecorators(entity) ?? [])
      .map((decorator) => decorator.expression)
      .filter(ts.isCallExpression);
    const permission = decorators.find(
      (call) => call.expression.getText() === "authenticated",
    )!;
    const actions = permission.arguments[0] as ts.ArrayLiteralExpression;
    expect(
      actions.elements.filter(ts.isStringLiteral).map((action) => action.text),
    ).toEqual(["create", "read", "update", "delete"]);
    const options = permission.arguments[1] as ts.ObjectLiteralExpression;
    const policy = options.properties
      .filter(ts.isPropertyAssignment)
      .find((property) => property.name.getText() === "policy")!
      .initializer as ts.ArrowFunction;
    expect(policy.body.getText(source)).toBe("syncWriterPolicy(claims)");
  });
});
