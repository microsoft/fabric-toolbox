// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ENTITIES = ['SyncJob', 'SyncTask', 'SyncCommand'] as const;

// Vite's test transform preserves TC39 decorators. Inspect their declarations
// with the existing TS compiler; Functions build separately checks their types.
function entitySource(name: string) {
  const path = resolve('rayfin', 'data', `${name}.ts`);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const entity = source.statements.find(ts.isClassDeclaration)!;
  return { source, entity };
}

function decoratorCalls(node: ts.ClassDeclaration | ts.PropertyDeclaration) {
  return (ts.getDecorators(node) ?? []).map((decorator) => decorator.expression).filter(ts.isCallExpression);
}

function actions(call: ts.CallExpression): string[] {
  const argument = call.arguments[0];
  if (ts.isStringLiteral(argument)) return [argument.text];
  if (ts.isArrayLiteralExpression(argument)) return argument.elements.filter(ts.isStringLiteral).map((item) => item.text);
  throw new Error('Expected explicit permission actions');
}

function option(call: ts.CallExpression, name: string, index = 0): ts.Expression | undefined {
  const argument = call.arguments[index];
  if (!argument || !ts.isObjectLiteralExpression(argument)) return undefined;
  return argument.properties.filter(ts.isPropertyAssignment).find((property) =>
    property.name.getText() === name)?.initializer;
}

function property(entity: ts.ClassDeclaration, name: string): ts.CallExpression {
  const field = entity.members.filter(ts.isPropertyDeclaration).find((member) => member.name.getText() === name)!;
  const calls = decoratorCalls(field);
  expect(calls).toHaveLength(1);
  return calls[0];
}

describe('durable synchronization data policies', () => {
  it('registers three additive entities in both the schema type and runtime registry', () => {
    const path = resolve('rayfin', 'data', 'schema.ts');
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const schemaType = source.statements.filter(ts.isTypeAliasDeclaration)
      .find((statement) => statement.name.text === 'AtlasSchema')!.type as ts.TypeLiteralNode;
    const schemaList = source.statements.filter(ts.isVariableStatement).flatMap((statement) =>
      statement.declarationList.declarations).find((declaration) => declaration.name.getText() === 'schema')!
      .initializer as ts.ArrayLiteralExpression;
    const names = schemaList.elements.map((element) => element.getText());
    expect(names).toHaveLength(26);
    expect(names).toContain('AccessPolicyEvidence');
    expect(names).toContain('OperationalIncident');
    const priorNames = names.filter((name) =>
      name !== 'AccessPolicyEvidence' && name !== 'OperationalIncident');
    expect(priorNames.slice(-9, -6)).toEqual(ENTITIES);
    expect(priorNames.at(-6)).toBe('WorkspaceScope');
    expect(priorNames.at(-5)).toBe('SynchronizerAuthority');
    expect(priorNames.slice(-4, -1)).toEqual(['SyncRootRun', 'SyncPayloadManifest', 'SyncPayloadChunk']);
    expect(priorNames.at(-1)).toBe('ItemRelationsEvidenceSnapshot');
    expect(names.slice(0, 3)).toEqual(['Workspace', 'FabricItem', 'LineageEdge']);
    for (const entity of ENTITIES) {
      expect(schemaType.members.filter(ts.isPropertySignature).map((member) => member.name.getText()))
        .toContain(entity);
    }
  });

  it.each(ENTITIES)('restricts every declared mutation of %s to the configured synchronizer subject', (name) => {
    const { entity, source } = entitySource(name);
    const permissions = decoratorCalls(entity).filter((call) => call.expression.getText() !== 'entity');
    expect(permissions.every((call) => call.expression.getText() === 'authenticated')).toBe(true);
    for (const action of ['create', 'update', 'delete'] as const) {
      const rules = permissions.filter((call) => actions(call).includes(action));
      expect(rules).toHaveLength(1);
      const policy = option(rules[0], 'policy', 1) as ts.ArrowFunction;
      expect(policy.body.getText(source)).toBe('claims.sub.eq(SYNC_WRITER_SUBJECT)');
    }
  });

  it('allows shared job reads but no shared internal command or task reads', () => {
    for (const name of ENTITIES) {
      const { entity, source } = entitySource(name);
      const rules = decoratorCalls(entity).filter((call) => call.expression.getText() === 'authenticated' &&
        actions(call).includes('read'));
      expect(rules).toHaveLength(1);
      const policy = option(rules[0], 'policy', 1) as ts.ArrowFunction | undefined;
      if (name === 'SyncJob') expect(policy).toBeUndefined();
      else expect(policy!.body.getText(source)).toBe('claims.sub.eq(SYNC_WRITER_SUBJECT)');
    }
  });

  it.each(ENTITIES)('bounds every text field and uses UUID workspace references in %s', (name) => {
    const { entity } = entitySource(name);
    expect(property(entity, 'id').expression.getText()).toBe('uuid');
    expect(property(entity, 'workspace_id').expression.getText()).toBe('uuid');
    for (const field of entity.members.filter(ts.isPropertyDeclaration)) {
      const calls = decoratorCalls(field);
      expect(calls).toHaveLength(1);
      if (calls[0].expression.getText() === 'text') {
        const max = option(calls[0], 'max');
        expect(max && ts.isNumericLiteral(max)).toBe(true);
        expect(Number(max!.getText())).toBeGreaterThan(0);
        expect(Number(max!.getText())).toBeLessThanOrEqual(240);
      }
    }
    const names = entity.members.filter(ts.isPropertyDeclaration).map((member) => member.name.getText());
    expect(names).not.toContain('accessToken');
    expect(names).not.toContain('endpoint');
  });

  it('enforces bounded unique active-job, task and command keys', () => {
    for (const [entity, key] of [
      ['SyncJob', 'activeKey'], ['SyncTask', 'taskKey'], ['SyncCommand', 'recordKey'],
    ] as const) {
      const field = property(entitySource(entity).entity, key);
      expect(field.expression.getText()).toBe('text');
      expect(option(field, 'max')!.getText()).toBe('80');
      expect(option(field, 'unique')!.kind).toBe(ts.SyntaxKind.TrueKeyword);
    }
    expect(option(property(entitySource('SyncJob').entity, 'activeKey'), 'optional')!.kind)
      .toBe(ts.SyntaxKind.TrueKeyword);
  });
});
