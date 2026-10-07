// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  requireAtlasSynchronizer,
  SYNCHRONIZER_AUTHORITY_ID,
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
    expect(policy.body.getText(source)).toBe(
      "claims.sub.eq(SYNC_WRITER_SUBJECT)",
    );
  });
});
