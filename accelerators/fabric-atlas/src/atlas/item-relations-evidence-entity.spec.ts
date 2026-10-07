// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Decorators are inspected through the TypeScript AST because the Vite test
// transform does not evaluate Rayfin entity metadata.
const path = resolve('rayfin', 'data', 'ItemRelationsEvidenceSnapshot.ts');
const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
const entity = source.statements.find(ts.isClassDeclaration)!;

function calls(node: ts.ClassDeclaration | ts.PropertyDeclaration): ts.CallExpression[] {
  return (ts.getDecorators(node) ?? []).map((decorator) => decorator.expression).filter(ts.isCallExpression);
}

function actions(call: ts.CallExpression): string[] {
  const argument = call.arguments[0];
  if (ts.isStringLiteral(argument)) return [argument.text];
  if (ts.isArrayLiteralExpression(argument)) return argument.elements.filter(ts.isStringLiteral).map((item) => item.text);
  return [];
}

function option(call: ts.CallExpression, name: string, index = 0): ts.Expression | undefined {
  const argument = call.arguments[index];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return undefined;
  return argument.properties.filter(ts.isPropertyAssignment)
    .find((property) => property.name.getText() === name)?.initializer;
}

function field(name: string): ts.CallExpression {
  const member = entity.members.filter(ts.isPropertyDeclaration).find((candidate) => candidate.name.getText() === name)!;
  return calls(member)[0];
}

describe('ItemRelationsEvidenceSnapshot entity', () => {
  const permissions = calls(entity).filter((call) => call.expression.getText() === 'authenticated');
  const rule = (action: string) => permissions.filter((call) => actions(call).includes(action));
  const policy = (action: string) =>
    (option(rule(action)[0], 'policy', 1) as ts.ArrowFunction | undefined)?.body
      .getText(source)
      .replace(/\s+/g, '');

  it('is registered additively in the schema after the earlier entities', () => {
    const schema = readFileSync(resolve('rayfin', 'data', 'schema.ts'), 'utf8').replace(/\r\n/g, '\n');
    expect(schema).toContain("ItemRelationsEvidenceSnapshot: ItemRelationsEvidenceSnapshot;");
    expect(schema.lastIndexOf('  ItemRelationsEvidenceSnapshot,'))
      .toBeGreaterThan(schema.lastIndexOf('  SyncPayloadChunk,'));
  });

  it('shares reads with the app audience and limits writes to the synchronizer', () => {
    expect(rule('read')).toHaveLength(1);
    expect(policy('read')).toBeUndefined();
    expect(policy('create')).toBe(
      'claims.email.eq(item.writerEmail).and(claims.sub.eq(SYNC_WRITER_SUBJECT))',
    );
    expect(policy('delete')).toBe('claims.sub.eq(SYNC_WRITER_SUBJECT)');
    expect(rule('update')).toHaveLength(0);
  });

  it('scopes rows by workspace, snapshot and envelope with bounded text', () => {
    for (const name of ['id', 'workspace_id', 'snapshotId', 'evidenceId']) {
      expect(field(name).expression.getText()).toBe('uuid');
      expect(option(field(name), 'optional')).toBeUndefined();
    }
    expect(option(field('correlationId'), 'optional')!.kind).toBe(ts.SyntaxKind.TrueKeyword);
    expect(field('rowType').arguments.map((argument) => argument.getText())).toEqual([
      "'manifest'",
      "'chunk'",
    ]);
    for (const member of entity.members.filter(ts.isPropertyDeclaration)) {
      const [call] = calls(member);
      if (call.expression.getText() !== 'text') continue;
      expect(Number(option(call, 'max')!.getText())).toBeLessThanOrEqual(3500);
    }
    const names = entity.members.filter(ts.isPropertyDeclaration).map((member) => member.name.getText());
    expect(names).not.toContain('sourceFabricId');
    expect(names).not.toContain('accessToken');
  });
});
