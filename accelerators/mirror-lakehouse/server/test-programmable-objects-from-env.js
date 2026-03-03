const axios = require('axios');
const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const FABRIC_API_BASE_URL = process.env.FABRIC_API_BASE_URL || 'https://api.fabric.microsoft.com/v1';
const APPLY_OBJECTS = String(process.env.TEST_APPLY_PROGRAMMABLE_OBJECTS || 'false').toLowerCase() === 'true';
const OBJECT_LIMIT = Math.max(0, Number(process.env.TEST_PROGRAMMABLE_OBJECT_LIMIT || 3));

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function isSystemSchemaName(schemaName) {
  const normalized = normalizeName(schemaName);
  return normalized === 'sys'
    || normalized === 'information_schema'
    || normalized === 'queryinsights';
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function logSection(title) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(title);
  console.log('='.repeat(80));
}

async function getAccessToken(scope) {
  const tenantId = getRequiredEnv('TENANT_ID');
  const clientId = getRequiredEnv('CLIENT_ID');
  const clientSecret = getRequiredEnv('CLIENT_SECRET');

  const response = await axios.post(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: 'client_credentials'
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000
    }
  );

  return response.data.access_token;
}

async function listWorkspaces(accessToken) {
  const response = await axios.get(`${FABRIC_API_BASE_URL}/workspaces`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  return response.data.value || [];
}

async function listLakehouses(accessToken, workspaceId) {
  const response = await axios.get(`${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items?type=Lakehouse`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  return response.data.value || [];
}

function pickByName(items, targetName) {
  const target = normalizeName(targetName);
  return (items || []).find(item => normalizeName(item.displayName || item.name) === target);
}

async function resolveWorkspaceAndLakehouse(accessToken, prefix) {
  const workspaceIdEnv = process.env[`${prefix}_WORKSPACE_ID`];
  const lakehouseIdEnv = process.env[`${prefix}_LAKEHOUSE_ID`];

  if (workspaceIdEnv && lakehouseIdEnv) {
    return {
      workspace: { id: workspaceIdEnv, name: process.env[`${prefix}_WORKSPACE_NAME`] || workspaceIdEnv },
      lakehouse: { id: lakehouseIdEnv, displayName: process.env[`${prefix}_LAKEHOUSE_NAME`] || lakehouseIdEnv }
    };
  }

  const workspaceName = getRequiredEnv(`${prefix}_WORKSPACE_NAME`);
  const lakehouseName = getRequiredEnv(`${prefix}_LAKEHOUSE_NAME`);

  const workspaces = await listWorkspaces(accessToken);
  const workspace = pickByName(workspaces, workspaceName);
  if (!workspace) {
    throw new Error(`Could not find ${prefix} workspace by name '${workspaceName}'`);
  }

  const lakehouses = await listLakehouses(accessToken, workspace.id);
  const lakehouse = pickByName(lakehouses, lakehouseName);
  if (!lakehouse) {
    throw new Error(`Could not find ${prefix} lakehouse '${lakehouseName}' in workspace '${workspaceName}'`);
  }

  return { workspace, lakehouse };
}

function parseSqlEndpointConnectionString(rawConnectionString) {
  const value = String(rawConnectionString || '').trim();
  if (!value) return { server: '', database: '' };

  if (!value.includes(';')) {
    return { server: value, database: '' };
  }

  const parts = value.split(';').map(part => part.trim()).filter(Boolean);
  let server = '';
  let database = '';

  for (const part of parts) {
    const [rawKey, ...rest] = part.split('=');
    if (!rawKey || rest.length === 0) continue;

    const key = rawKey.trim().toLowerCase();
    const val = rest.join('=').trim();

    if (key === 'server' || key === 'data source' || key === 'address' || key === 'addr') {
      server = val.replace(/^tcp:/i, '').replace(/,\d+$/i, '').trim();
    }

    if (key === 'database' || key === 'initial catalog') {
      database = val;
    }
  }

  return { server, database };
}

async function resolveSqlDetails(accessToken, workspaceId, lakehouseId) {
  const response = await axios.get(`${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/lakehouses/${lakehouseId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  const payload = response.data || {};
  const connectionString =
    payload?.sqlEndpoint?.connectionString ||
    payload?.properties?.sqlEndpoint?.connectionString ||
    payload?.properties?.sqlEndpointProperties?.connectionString ||
    '';

  const parsed = parseSqlEndpointConnectionString(connectionString);
  const endpointId = payload?.properties?.sqlEndpointProperties?.id;
  const displayName = payload?.displayName;

  const dbCandidates = Array.from(new Set([
    parsed.database,
    displayName,
    lakehouseId,
    endpointId
  ].filter(Boolean)));

  return {
    server: parsed.server || connectionString,
    dbCandidates,
    endpointId
  };
}

async function refreshSqlEndpointMetadata(accessToken, workspaceId, sqlEndpointId) {
  if (!sqlEndpointId) {
    throw new Error('Destination SQL endpoint ID is required for metadata refresh.');
  }

  const refreshUrl = `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/sqlEndpoints/${sqlEndpointId}/refreshMetadata`;
  const refreshPayload = {
    recreateTables: false,
    timeout: {
      timeUnit: 'Minutes',
      value: 15
    }
  };

  let response = null;
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    response = await axios.post(
      refreshUrl,
      refreshPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        validateStatus: () => true
      }
    );

    if (![429, 503].includes(response.status)) {
      break;
    }

    if (attempt < maxAttempts) {
      const retryAfterHeader = Number(response.headers?.['retry-after'] || response.headers?.['Retry-After']);
      const retryAfterSeconds = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? Math.min(retryAfterHeader, 30)
        : 5;
      await new Promise(resolve => setTimeout(resolve, retryAfterSeconds * 1000));
    }
  }

  if (response.status === 200) {
    return { mode: 'immediate', statusCode: 200 };
  }

  if (response.status !== 202) {
    throw new Error(`SQL endpoint metadata refresh failed with status ${response.status}: ${JSON.stringify(response.data || {})}`);
  }

  const operationUrl = response.headers?.location || response.headers?.Location;
  if (!operationUrl) {
    throw new Error('SQL endpoint metadata refresh returned 202 without Location header.');
  }

  for (let attempt = 1; attempt <= 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const pollResponse = await axios.get(operationUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: () => true
    });

    if (pollResponse.status === 200) {
      return { mode: 'lro', statusCode: 200, attempts: attempt };
    }

    if (pollResponse.status === 202) {
      continue;
    }

    throw new Error(`SQL endpoint metadata refresh polling failed with status ${pollResponse.status}: ${JSON.stringify(pollResponse.data || {})}`);
  }

  throw new Error('SQL endpoint metadata refresh timed out after 60 polling attempts.');
}

async function ensureSchemasExist(destinationPool, schemaNames) {
  const uniqueSchemas = Array.from(new Set((schemaNames || []).map(name => String(name || '').trim()).filter(Boolean)));
  const summary = {
    created: [],
    existing: [],
    failed: []
  };

  for (const schemaName of uniqueSchemas) {
    try {
      const escaped = schemaName.replace(/'/g, "''");
      const check = await destinationPool.request().query(`SELECT schema_id FROM sys.schemas WHERE name = N'${escaped}'`);
      if (Array.isArray(check.recordset) && check.recordset.length > 0) {
        summary.existing.push(schemaName);
        continue;
      }

      await destinationPool.request().batch(`CREATE SCHEMA [${schemaName.replace(/\]/g, ']]')}];`);
      summary.created.push(schemaName);
    } catch (error) {
      summary.failed.push({ name: schemaName, error: error.message });
    }
  }

  return summary;
}

async function connectSql(server, dbCandidates, sqlToken) {
  for (const database of dbCandidates) {
    let pool = null;
    try {
      pool = await sql.connect({
        server,
        database,
        options: {
          encrypt: true,
          trustServerCertificate: false,
          enableArithAbort: true
        },
        authentication: {
          type: 'azure-active-directory-access-token',
          options: {
            token: sqlToken
          }
        },
        connectionTimeout: 15000,
        requestTimeout: 30000
      });

      return { pool, database };
    } catch (error) {
      if (pool) {
        try { await pool.close(); } catch { }
      }
    }
  }

  throw new Error(`Failed SQL connection for server '${server}' using database candidates: ${dbCandidates.join(', ')}`);
}

function toCreateOrAlterStatement(definition, objectType, schemaName, objectName) {
  const body = String(definition || '').trim();
  if (!body) return null;

  const typeKeyword = objectType === 'view' ? 'VIEW' : 'PROCEDURE';
  const createOrAlterRegex = /^\s*(CREATE|ALTER)\s+(OR\s+ALTER\s+)?(VIEW|PROC|PROCEDURE)\b/i;

  if (createOrAlterRegex.test(body)) {
    return body.replace(createOrAlterRegex, `CREATE OR ALTER ${typeKeyword}`);
  }

  if (/^\s*AS\b/i.test(body)) {
    return `CREATE OR ALTER ${typeKeyword} [${schemaName}].[${objectName}]\n${body}`;
  }

  return `CREATE OR ALTER ${typeKeyword} [${schemaName}].[${objectName}]\nAS\n${body}`;
}

async function loadProgrammableObjects(pool) {
  const [viewsResult, proceduresResult] = await Promise.all([
    pool.request().query(`
      SELECT
        s.name AS schemaName,
        v.name AS name,
        m.definition AS definition
      FROM sys.views v
      INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
      INNER JOIN sys.sql_modules m ON v.object_id = m.object_id
    `),
    pool.request().query(`
      SELECT
        s.name AS schemaName,
        p.name AS name,
        m.definition AS definition
      FROM sys.procedures p
      INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
      INNER JOIN sys.sql_modules m ON p.object_id = m.object_id
    `)
  ]);

  const views = Array.isArray(viewsResult.recordset) ? viewsResult.recordset : [];
  const procedures = Array.isArray(proceduresResult.recordset) ? proceduresResult.recordset : [];

  return { views, procedures };
}

async function applyObjects(destinationPool, objects, objectType, limit) {
  const selected = objects.slice(0, limit);
  const summary = {
    attempted: selected.length,
    applied: [],
    failed: []
  };

  for (const object of selected) {
    const statement = toCreateOrAlterStatement(object.definition, objectType, object.schemaName, object.name);
    const fullName = `${object.schemaName}.${object.name}`;

    if (!statement) {
      summary.failed.push({ name: fullName, error: 'Empty definition' });
      continue;
    }

    try {
      await destinationPool.request().batch(statement);
      summary.applied.push(fullName);
    } catch (error) {
      summary.failed.push({ name: fullName, error: error.message });
    }
  }

  return summary;
}

async function main() {
  logSection('Programmable Objects SQL Integration Test');

  const fabricToken = await getAccessToken('https://api.fabric.microsoft.com/.default');
  const sqlToken = await getAccessToken('https://database.windows.net/.default');

  const source = await resolveWorkspaceAndLakehouse(fabricToken, 'SOURCE');
  const destination = await resolveWorkspaceAndLakehouse(fabricToken, 'DESTINATION');

  console.log(`Source: ${source.workspace.name} / ${source.lakehouse.displayName}`);
  console.log(`Destination: ${destination.workspace.name} / ${destination.lakehouse.displayName}`);

  const sourceSqlDetails = await resolveSqlDetails(fabricToken, source.workspace.id, source.lakehouse.id);
  const destinationSqlDetails = await resolveSqlDetails(fabricToken, destination.workspace.id, destination.lakehouse.id);

  console.log(`Source SQL server: ${sourceSqlDetails.server}`);
  console.log(`Source DB candidates: ${sourceSqlDetails.dbCandidates.join(', ')}`);
  console.log(`Destination SQL server: ${destinationSqlDetails.server}`);
  console.log(`Destination DB candidates: ${destinationSqlDetails.dbCandidates.join(', ')}`);
  console.log(`Destination SQL endpoint id: ${destinationSqlDetails.endpointId || 'N/A'}`);

  const { pool: sourcePool, database: sourceDatabase } = await connectSql(sourceSqlDetails.server, sourceSqlDetails.dbCandidates, sqlToken);
  console.log(`Connected to source SQL database: ${sourceDatabase}`);

  const { views, procedures } = await loadProgrammableObjects(sourcePool);
  const userViews = views.filter(item => !isSystemSchemaName(item.schemaName));
  const userProcedures = procedures.filter(item => !isSystemSchemaName(item.schemaName));

  console.log(`Source views discovered: ${views.length} (user-migratable: ${userViews.length})`);
  console.log(`Source stored procedures discovered: ${procedures.length} (user-migratable: ${userProcedures.length})`);

  if (!APPLY_OBJECTS) {
    console.log('APPLY disabled. Set TEST_APPLY_PROGRAMMABLE_OBJECTS=true to test CREATE OR ALTER migration.');
    await sourcePool.close();
    return;
  }

  const { pool: destinationPool, database: destinationDatabase } = await connectSql(
    destinationSqlDetails.server,
    destinationSqlDetails.dbCandidates,
    sqlToken
  );
  console.log(`Connected to destination SQL database: ${destinationDatabase}`);

  const refreshSummary = await refreshSqlEndpointMetadata(
    fabricToken,
    destination.workspace.id,
    destinationSqlDetails.endpointId
  );
  console.log('SQL endpoint metadata refresh summary:', JSON.stringify(refreshSummary));

  const selectedViews = userViews.slice(0, OBJECT_LIMIT);
  const selectedProcedures = userProcedures.slice(0, OBJECT_LIMIT);
  const requiredSchemas = Array.from(new Set([
    ...selectedViews.map(item => item.schemaName),
    ...selectedProcedures.map(item => item.schemaName)
  ].filter(Boolean)));
  const schemaSummary = await ensureSchemasExist(destinationPool, requiredSchemas);
  console.log('Destination schema ensure summary:', JSON.stringify(schemaSummary, null, 2));

  const viewSummary = await applyObjects(destinationPool, selectedViews, 'view', OBJECT_LIMIT);
  const procSummary = await applyObjects(destinationPool, selectedProcedures, 'procedure', OBJECT_LIMIT);

  console.log('\nView apply summary:', JSON.stringify(viewSummary, null, 2));
  console.log('\nStored procedure apply summary:', JSON.stringify(procSummary, null, 2));

  await destinationPool.close();
  await sourcePool.close();

  if (viewSummary.failed.length > 0 || procSummary.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('Test failed:', error.message);
  process.exitCode = 1;
});
