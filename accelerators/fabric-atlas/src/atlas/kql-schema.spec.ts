// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  KQL_SCHEMA_LIMITS,
  KqlSchemaError,
  extractKqlSchemaScript,
  parseKqlDatabaseSchema,
} from "../../rayfin/functions/src/kql-schema";

const DOCUMENTED_UNPADDED_SCHEMA =
  "Ly8gS1FMIHNjcmlwdAovLyBVc2UgbWFuYWdlbWVudCBjb21tYW5kcyBpbiB0aGlzIHNjcmlwdCB0byBjb25maWd1cmUgeW91ciBkYXRhYmFzZSBpdGVtcywgc3VjaCBhcyB0YWJsZXMsIGZ1bmN0aW9ucywgbWF0ZXJpYWxpemVkIHZpZXdzLCBhbmQgbW9yZS4KCi5jcmVhdGUtbWVyZ2UgdGFibGUgTXlMb2dzIChMZXZlbDpzdHJpbmcsIFRpbWVzdGFtcDpkYXRldGltZSwgVXNlcklkOnN0cmluZywgVHJhY2VJZDpzdHJpbmcsIE1lc3NhZ2U6c3RyaW5nLCBQcm9jZXNzSWQ6aW50KQ";

function encode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function definition(parts: unknown[]) {
  return { definition: { parts } };
}

function schemaPart(script: string, path = "DatabaseSchema.kql") {
  return { path, payload: encode(script), payloadType: "InlineBase64" };
}

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof KqlSchemaError ? error.code : "unexpected";
  }
  return undefined;
}

describe("KQL definition part extraction", () => {
  it("decodes the documented unpadded DatabaseSchema.kql sample and skips platform metadata unread", () => {
    const extracted = extractKqlSchemaScript(
      definition([
        { path: "DatabaseProperties.json", payload: "not base64!", payloadType: "InlineBase64" },
        { path: "DatabaseSchema.kql", payload: DOCUMENTED_UNPADDED_SCHEMA, payloadType: "InlineBase64" },
        { path: ".platform", payload: "ZG90UGxhdGZvcm1CYXNlNjRTdHJpbmc", payloadType: "InlineBase64" },
      ]),
    );
    expect(extracted.unknownParts).toBe(0);
    expect(parseKqlDatabaseSchema(extracted.script!)).toEqual({
      tables: [
        {
          name: "MyLogs",
          columns: [
            { name: "Level", dataType: "string" },
            { name: "Timestamp", dataType: "datetime" },
            { name: "UserId", dataType: "string" },
            { name: "TraceId", dataType: "string" },
            { name: "Message", dataType: "string" },
            { name: "ProcessId", dataType: "int" },
          ],
        },
      ],
      functions: [],
      materializedViews: [],
      ignoredStatements: 0,
      unsupportedStatements: 0,
      truncated: false,
    });
  });

  it("accepts padded payloads and counts unknown parts without decoding them", () => {
    const extracted = extractKqlSchemaScript(
      definition([
        schemaPart(".create table T (a:int)\n"),
        { path: "Future/part.bin", payload: "not base64!", payloadType: "Future" },
      ]),
    );
    expect(extracted).toEqual({ script: ".create table T (a:int)\n", unknownParts: 1 });
    expect(extractKqlSchemaScript(definition([]))).toEqual({ script: undefined, unknownParts: 0 });
  });

  it.each([
    ["a traversal path", definition([schemaPart(".create table T (a:int)", "../DatabaseSchema.kql")])],
    ["an absolute path", definition([schemaPart(".create table T (a:int)", "/DatabaseSchema.kql")])],
    ["a control-character path", definition([schemaPart(".create table T (a:int)", "Database\nSchema.kql")])],
    ["a duplicate schema part", definition([schemaPart("// a"), schemaPart("// b", "databaseschema.kql")])],
    ["an unsupported payload type", definition([{ ...schemaPart("// a"), payloadType: "InlineText" }])],
    ["invalid base64 characters", definition([{ path: "DatabaseSchema.kql", payload: "Ly8*YQ==", payloadType: "InlineBase64" }])],
    ["an impossible base64 length", definition([{ path: "DatabaseSchema.kql", payload: "Ly8gY", payloadType: "InlineBase64" }])],
    ["misplaced padding", definition([{ path: "DatabaseSchema.kql", payload: "Ly=", payloadType: "InlineBase64" }])],
    ["invalid UTF-8", definition([{ path: "DatabaseSchema.kql", payload: "/w==", payloadType: "InlineBase64" }])],
    ["non-array parts", { definition: { parts: {} } }],
    ["too many parts", definition(Array.from({ length: 501 }, (_, index) => schemaPart("// x", `Future/${index}.kql`)))],
    ["a missing definition", { parts: [] }],
  ])("rejects %s", (_name, response) => {
    expect(errorCode(() => extractKqlSchemaScript(response))).toBe("invalid-definition");
  });

  it("rejects an oversized schema payload before decoding it", () => {
    const payload = "A".repeat(Math.ceil(((KQL_SCHEMA_LIMITS.maxDecodedBytes + 3) * 4) / 3));
    expect(
      errorCode(() =>
        extractKqlSchemaScript(definition([{ path: "DatabaseSchema.kql", payload, payloadType: "InlineBase64" }])),
      ),
    ).toBe("response-size-exceeded");
  });
});

describe("KQL structural schema parser", () => {
  it("parses tables, multiline and escaped identifiers, merges and type aliases", () => {
    const parsed = parseKqlDatabaseSchema(
      [
        ".create table Events (",
        "  Id: guid,  // inline comment",
        "  Created: date,",
        "  Payload: dynamic",
        ") with (folder = \"Raw\", docstring = \"private table note\")",
        "",
        ".create-merge table ['Sales Orders'] (['Order Id']:int64, Total:double, Flag:boolean)",
        ".create-merge tables A (x:int32), [\"Odd \\\"Name\\\"\"] (y:uuid)",
        ".alter-merge table Events (Region:string)",
        ".alter table A (z:timespan)",
        ".create-merge table Données (Région:string)",
      ].join("\r\n"),
    );
    expect(parsed.tables).toEqual([
      { name: "A", columns: [{ name: "z", dataType: "timespan" }] },
      { name: "Données", columns: [{ name: "Région", dataType: "string" }] },
      {
        name: "Events",
        columns: [
          { name: "Id", dataType: "guid" },
          { name: "Created", dataType: "datetime" },
          { name: "Payload", dataType: "dynamic" },
          { name: "Region", dataType: "string" },
        ],
      },
      { name: "Odd \"Name\"", columns: [{ name: "y", dataType: "guid" }] },
      {
        name: "Sales Orders",
        columns: [
          { name: "Order Id", dataType: "long" },
          { name: "Total", dataType: "real" },
          { name: "Flag", dataType: "bool" },
        ],
      },
    ]);
    expect(parsed).toMatchObject({ ignoredStatements: 0, unsupportedStatements: 0, truncated: false });
    expect(JSON.stringify(parsed)).not.toContain("private");
  });

  it("returns function names and signatures without bodies, property bags or defaults", () => {
    const parsed = parseKqlDatabaseSchema(
      [
        ".create-or-alter function with (folder = \"private folder\", docstring = \"Password=private-secret;\", skipvalidation = \"true\")",
        "TopErrors(since: timespan = 1d, level: string = \"private default\", source: (*), shaped: (a:int, b:string), tags: dynamic = dynamic([\"private\"]))",
        "{",
        "  let secret = \"Server=private;Password=private-secret;\";",
        "  Events",
        ".create table Smuggled (a:int)",
        "  | where Created > ago(since) // private comment",
        "  | project Id",
        "}",
        ".create function ifnotexists ['Daily Summary']() { Events | count }",
        ".alter function TopErrors docstring \"private doc\"",
      ].join("\n"),
    );
    expect(parsed.functions).toEqual([
      { name: "Daily Summary", parameters: [] },
      {
        name: "TopErrors",
        parameters: [
          { name: "since", dataType: "timespan" },
          { name: "level", dataType: "string" },
          { name: "source", dataType: "tabular" },
          { name: "shaped", dataType: "tabular" },
          { name: "tags", dataType: "dynamic" },
        ],
      },
    ]);
    expect(parsed.tables).toEqual([]);
    expect(parsed).toMatchObject({ ignoredStatements: 1, unsupportedStatements: 0 });
    const serialized = JSON.stringify(parsed);
    for (const forbidden of ["private", "Password", "Server=", "Events", "ago", "secret", "folder"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns materialized-view names and identifiable source tables only", () => {
    const parsed = parseKqlDatabaseSchema(
      [
        ".create async ifnotexists materialized-view with (backfill = true, docstring = \"private\") ErrorsByHour on table Events",
        "{",
        "  Events | where Level == \"private\" | summarize count() by bin(Created, 1h)",
        "}",
        ".create-or-alter materialized-view Rollup on materialized-view ErrorsByHour { ErrorsByHour | summarize sum(count_) }",
        ".alter materialized-view ErrorsByHour docstring \"private doc\"",
        ".alter-merge materialized-view ErrorsByHour policy retention ```{\"SoftDeletePeriod\":\"365.00:00:00\"}```",
      ].join("\n"),
    );
    expect(parsed.materializedViews).toEqual([
      { name: "ErrorsByHour", sourceTable: "Events" },
      { name: "Rollup" },
    ]);
    expect(parsed).toMatchObject({ ignoredStatements: 2, unsupportedStatements: 0 });
    expect(JSON.stringify(parsed)).not.toContain("private");
  });

  it("never splits statements inside comments, strings or multi-line blocks", () => {
    const parsed = parseKqlDatabaseSchema(
      [
        "// .create table CommentTable (a:int)",
        ".create-merge table Real (a:int) // .create table Trailing (b:int)",
        ".alter table Real policy update ```",
        ".create table BlockTable (a:int)",
        "```",
        ".create-or-alter table Real ingestion json mapping 'private' '[{\"column\":\"a\",\"path\":\"$.private\"}]'",
        ".add database ['db'] users ('aaduser=private@contoso.com') 'private principal'",
        ".alter database ['db'] policy caching hot = 30d",
      ].join("\n"),
    );
    expect(parsed.tables.map((table) => table.name)).toEqual(["Real"]);
    expect(parsed).toMatchObject({ ignoredStatements: 4, unsupportedStatements: 0 });
    expect(JSON.stringify(parsed)).not.toContain("private");
  });

  it("counts unknown or unprovable declarations as unsupported without returning their content", () => {
    const parsed = parseKqlDatabaseSchema(
      [
        "stray text before any command",
        ".create table Good (a:int)",
        ".create external table Ext (a:string) kind=storage dataformat=csv (h@'https://acct.blob.core.windows.net/c;private-key')",
        ".set-or-append Good <| print a = 1",
        ".execute database script <| .create table Inner (a:int)",
        ".drop table Good",
        ".create table Copy based-on Good",
        ".create table Vector (a:vector)",
        ".create table ['Password=private;'] (a:int)",
        ".create-merge table Good (a:string)",
        ".create table Trailing (a:int) private",
        ".unknown-command something",
      ].join("\n"),
    );
    expect(parsed.tables).toEqual([{ name: "Good", columns: [{ name: "a", dataType: "int" }] }]);
    expect(parsed).toMatchObject({ ignoredStatements: 0, unsupportedStatements: 11 });
    const serialized = JSON.stringify(parsed);
    for (const forbidden of ["private", "Ext", "Inner", "Copy", "Vector", "Password", "blob"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    ["an unbalanced brace", ".create function F() { T | take 1"],
    ["an unmatched closer", ".create table T (a:int))"],
    ["an unterminated string", ".create table T (a:int) with (docstring = \"open"],
    ["a multi-line regular string", ".create table T (a:int) with (docstring = 'line\nbreak')"],
    ["an unterminated multi-line block", ".alter table T policy update ```\n[]"],
  ])("rejects a script with %s as invalid", (_name, script) => {
    expect(errorCode(() => parseKqlDatabaseSchema(script))).toBe("invalid-definition");
  });

  it("marks collections truncated at their bounds instead of growing without limit", () => {
    const script = Array.from({ length: KQL_SCHEMA_LIMITS.maxTables + 1 }, (_, index) => `.create table T${index} (a:int)`).join("\n");
    const parsed = parseKqlDatabaseSchema(script);
    expect(parsed.tables).toHaveLength(KQL_SCHEMA_LIMITS.maxTables);
    expect(parsed.truncated).toBe(true);
    expect(parsed.unsupportedStatements).toBe(0);
  });
});
