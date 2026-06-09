const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const FABRIC_API_BASE_URL = process.env.FABRIC_API_BASE_URL || 'https://api.fabric.microsoft.com/v1';
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://localhost:3001';
const TEST_DELETE_SHORTCUTS = String(process.env.TEST_DELETE_SHORTCUTS || 'false').toLowerCase() === 'true';
const MAX_SYNC_ROUNDS = Number(process.env.MAX_SYNC_ROUNDS || 3);
const ENABLE_TABLE_PARITY_VALIDATION = String(process.env.ENABLE_TABLE_PARITY_VALIDATION || 'true').toLowerCase() === 'true';
const ONELAKE_TABLE_API_BASE_URL = process.env.ONELAKE_TABLE_API_BASE_URL || 'https://onelake.table.fabric.microsoft.com/delta';
const ONELAKE_TABLE_API_SCOPE = process.env.ONELAKE_TABLE_API_SCOPE || 'https://onelake.table.fabric.microsoft.com/.default';

function logSection(title) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(title);
  console.log('='.repeat(80));
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function decodeJwt(accessToken) {
  try {
    const payload = accessToken.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueSorted(values) {
  return Array.from(new Set((values || []).map(v => String(v).trim()).filter(Boolean))).sort();
}

function pickByName(items, name) {
  const target = normalizeName(name);
  return items.find(item => normalizeName(item.displayName || item.name) === target);
}

function getTableSchemaName(table) {
  if (table?.schema) return String(table.schema).trim();
  if (table?.schemaName) return String(table.schemaName).trim();

  const location = String(table?.location || '');
  const locationMatch = location.match(/(?:^|\/)Tables\/([^\/]+)/i);
  if (locationMatch?.[1]) return locationMatch[1].trim();

  const tableName = String(table?.name || '');
  if (tableName.includes('.')) return tableName.split('.')[0].trim();

  return 'dbo';
}

function deriveSchemasFromTables(tables) {
  return uniqueSorted((tables || []).map(getTableSchemaName));
}

async function getAccessToken() {
  return getAccessTokenForScope('https://api.fabric.microsoft.com/.default');
}

async function getAccessTokenForScope(scope) {
  const tenantId = getRequiredEnv('TENANT_ID');
  const clientId = getRequiredEnv('CLIENT_ID');
  const clientSecret = getRequiredEnv('CLIENT_SECRET');

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope,
    grant_type: 'client_credentials'
  });

  const response = await axios.post(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  });

  return response.data.access_token;
}

function buildOneLakeCatalogCandidates(lakehouse) {
  const displayName = String(lakehouse?.name || '').trim();
  const withSuffix = displayName.toLowerCase().endsWith('.lakehouse') ? displayName : `${displayName}.Lakehouse`;
  return uniqueSorted([withSuffix, lakehouse?.id].filter(Boolean));
}

function parseUnityCatalogSchemas(payload) {
  const schemaFromSchemas = (payload?.schemas || []).map(s => s?.name).filter(Boolean);
  const schemaFromNamespaces = (payload?.namespaces || [])
    .map(ns => Array.isArray(ns) ? ns[ns.length - 1] : ns)
    .filter(Boolean);
  return uniqueSorted([...schemaFromSchemas, ...schemaFromNamespaces]);
}

function parseUnityCatalogTables(payload) {
  const tableObjects = payload?.tables || [];
  return uniqueSorted(tableObjects.map(table => {
    if (table?.name) return table.name;
    if (table?.full_name) {
      const parts = String(table.full_name).split('.');
      return parts[parts.length - 1];
    }
    return null;
  }).filter(Boolean));
}

async function requestFirstSuccess(urls, headers) {
  const errors = [];
  for (const url of urls) {
    try {
      const response = await axios.get(url, { headers, timeout: 30000 });
      return { ok: true, url, data: response.data, errors };
    } catch (error) {
      errors.push({
        url,
        status: error.response?.status || 'N/A',
        message: error.response?.data?.message || error.message,
        errorCode: error.response?.data?.errorCode
      });
    }
  }

  return { ok: false, errors };
}

async function listOneLakeSchemas(lakehouse, workspace, headers) {
  const catalogs = buildOneLakeCatalogCandidates(lakehouse);
  const urls = [];

  for (const catalog of catalogs) {
    urls.push(`${ONELAKE_TABLE_API_BASE_URL}/${encodeURIComponent(workspace.id)}/${encodeURIComponent(lakehouse.id)}/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`);
    urls.push(`${ONELAKE_TABLE_API_BASE_URL}/${encodeURIComponent(workspace.name)}/${encodeURIComponent(catalog)}/api/2.1/unity-catalog/schemas?catalog_name=${encodeURIComponent(catalog)}`);
  }

  const result = await requestFirstSuccess(urls, headers);
  if (!result.ok) {
    return {
      ok: false,
      schemas: [],
      errors: result.errors
    };
  }

  return {
    ok: true,
    schemas: parseUnityCatalogSchemas(result.data),
    url: result.url,
    errors: result.errors
  };
}

async function listOneLakeTablesForSchema(lakehouse, workspace, schemaName, headers) {
  const catalogs = buildOneLakeCatalogCandidates(lakehouse);
  const urls = [];

  for (const catalog of catalogs) {
    const query = `catalog_name=${encodeURIComponent(catalog)}&schema_name=${encodeURIComponent(schemaName)}`;
    urls.push(`${ONELAKE_TABLE_API_BASE_URL}/${encodeURIComponent(workspace.id)}/${encodeURIComponent(lakehouse.id)}/api/2.1/unity-catalog/tables?${query}`);
    urls.push(`${ONELAKE_TABLE_API_BASE_URL}/${encodeURIComponent(workspace.name)}/${encodeURIComponent(catalog)}/api/2.1/unity-catalog/tables?${query}`);
  }

  const result = await requestFirstSuccess(urls, headers);
  if (!result.ok) {
    return {
      ok: false,
      tables: [],
      errors: result.errors
    };
  }

  return {
    ok: true,
    tables: parseUnityCatalogTables(result.data),
    url: result.url,
    errors: result.errors
  };
}

function diffTableKeys(sourceTableKeys, destinationTableKeys) {
  const src = new Set(sourceTableKeys.map(normalizeName));
  const dst = new Set(destinationTableKeys.map(normalizeName));

  return {
    missingInDestination: uniqueSorted(sourceTableKeys.filter(key => !dst.has(normalizeName(key)))),
    extraInDestination: uniqueSorted(destinationTableKeys.filter(key => !src.has(normalizeName(key))))
  };
}

async function runTableParityPass(resolved, sourceSchemaNames) {
  logSection('TEST 3: Table-level parity pass (OneLake Table API)');

  if (!ENABLE_TABLE_PARITY_VALIDATION) {
    console.log('⏭️ Table-level pass skipped: ENABLE_TABLE_PARITY_VALIDATION=false');
    return { supported: false, skipped: true, matched: false, reason: 'disabled' };
  }

  let tableApiToken;
  try {
    tableApiToken = await getAccessTokenForScope(ONELAKE_TABLE_API_SCOPE);
  } catch (error) {
    console.log('⏭️ Table-level pass skipped: could not get OneLake Table API token');
    console.log(`   Scope used: ${ONELAKE_TABLE_API_SCOPE}`);
    console.log(`   Error: ${error.response?.data?.error_description || error.message}`);
    return { supported: false, skipped: true, matched: false, reason: 'token' };
  }

  const headers = {
    Authorization: `Bearer ${tableApiToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  const sourceSchemasResult = await listOneLakeSchemas(
    resolved.sourceLakehouse,
    resolved.sourceWorkspace,
    headers
  );

  const destinationSchemasResult = await listOneLakeSchemas(
    resolved.destinationLakehouse,
    resolved.destinationWorkspace,
    headers
  );

  if (!sourceSchemasResult.ok || !destinationSchemasResult.ok) {
    console.log('⏭️ Table-level pass skipped: OneLake schema endpoint not available with current setup');
    const firstError = sourceSchemasResult.errors?.[0] || destinationSchemasResult.errors?.[0];
    if (firstError) {
      console.log(`   First error: status=${firstError.status}, code=${firstError.errorCode || 'N/A'}, message=${firstError.message}`);
    }
    console.log('   Setup needed: grant token audience/scope for OneLake Table API and ensure endpoint access in tenant.');
    return { supported: false, skipped: true, matched: false, reason: 'endpoint' };
  }

  console.log(`Source schema endpoint: ${sourceSchemasResult.url}`);
  console.log(`Destination schema endpoint: ${destinationSchemasResult.url}`);

  const schemasToCompare = uniqueSorted(sourceSchemaNames.length ? sourceSchemaNames : sourceSchemasResult.schemas);

  const sourceTableKeys = [];
  const destinationTableKeys = [];
  const endpointErrors = [];

  for (const schemaName of schemasToCompare) {
    const sourceTables = await listOneLakeTablesForSchema(
      resolved.sourceLakehouse,
      resolved.sourceWorkspace,
      schemaName,
      headers
    );

    const destinationTables = await listOneLakeTablesForSchema(
      resolved.destinationLakehouse,
      resolved.destinationWorkspace,
      schemaName,
      headers
    );

    if (!sourceTables.ok || !destinationTables.ok) {
      endpointErrors.push({
        schemaName,
        sourceError: sourceTables.errors?.[0] || null,
        destinationError: destinationTables.errors?.[0] || null
      });
      continue;
    }

    sourceTables.tables.forEach(tableName => sourceTableKeys.push(`${schemaName}.${tableName}`));
    destinationTables.tables.forEach(tableName => destinationTableKeys.push(`${schemaName}.${tableName}`));
  }

  if (endpointErrors.length > 0 && sourceTableKeys.length === 0 && destinationTableKeys.length === 0) {
    console.log('⏭️ Table-level pass skipped: table listing endpoints failed for all schemas.');
    const first = endpointErrors[0];
    const firstError = first.sourceError || first.destinationError;
    if (firstError) {
      console.log(`   First error: status=${firstError.status}, code=${firstError.errorCode || 'N/A'}, message=${firstError.message}`);
    }
    return { supported: false, skipped: true, matched: false, reason: 'tables-endpoint' };
  }

  const diff = diffTableKeys(uniqueSorted(sourceTableKeys), uniqueSorted(destinationTableKeys));

  console.log(`Source table count: ${uniqueSorted(sourceTableKeys).length}`);
  console.log(`Destination table count: ${uniqueSorted(destinationTableKeys).length}`);
  console.log(`Missing tables in destination: ${diff.missingInDestination.length}`);
  console.log(`Extra tables in destination: ${diff.extraInDestination.length}`);

  if (diff.missingInDestination.length === 0 && diff.extraInDestination.length === 0) {
    console.log('✅ Table-level parity matched.');
    return { supported: true, skipped: false, matched: true };
  }

  if (diff.missingInDestination.length > 0) {
    console.log(`Missing examples: ${diff.missingInDestination.slice(0, 10).join(', ')}`);
  }
  if (diff.extraInDestination.length > 0) {
    console.log(`Extra examples: ${diff.extraInDestination.slice(0, 10).join(', ')}`);
  }

  return {
    supported: true,
    skipped: false,
    matched: false,
    missingInDestination: diff.missingInDestination,
    extraInDestination: diff.extraInDestination
  };
}

async function getWorkspaces(headers) {
  const response = await axios.get(`${FABRIC_API_BASE_URL}/workspaces`, { headers, timeout: 30000 });
  return response.data.value || [];
}

async function getLakehouses(workspaceId, headers) {
  const response = await axios.get(`${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items?type=Lakehouse`, {
    headers,
    timeout: 30000
  });
  return response.data.value || [];
}

async function getTables(lakehouseId, workspaceId, headers) {
  const urls = [
    `${FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/tables`,
    `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/lakehouses/${lakehouseId}/tables`,
    `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/lakehouse/tables`
  ];

  for (const url of urls) {
    try {
      const response = await axios.get(url, { headers, timeout: 30000 });
      return response.data.value || [];
    } catch (error) {
      if (error.response?.data?.errorCode === 'UnsupportedOperationForSchemasEnabledLakehouse') {
        return [];
      }
    }
  }

  return [];
}

async function getSchemasWithFallback(lakehouseId, workspaceId, headers) {
  const urls = [
    `${FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/schemas`,
    `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/lakehouse/schemas`,
    `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/schemas`
  ];

  const errors = [];

  for (const url of urls) {
    try {
      const response = await axios.get(url, { headers, timeout: 30000 });
      const schemas = (response.data.value || []).map(s => s.name).filter(Boolean);
      return {
        source: 'schemas-endpoint',
        resolvedUrl: url,
        schemaNames: uniqueSorted(schemas),
        errors
      };
    } catch (error) {
      errors.push({
        url,
        status: error.response?.status || 'N/A',
        message: error.response?.data?.message || error.message
      });
    }
  }

  const tables = await getTables(lakehouseId, workspaceId, headers);
  const derivedSchemas = deriveSchemasFromTables(tables);
  const finalSchemas = derivedSchemas.length ? derivedSchemas : ['dbo'];

  return {
    source: 'tables-fallback',
    resolvedUrl: `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/lakehouses/${lakehouseId}/tables`,
    schemaNames: finalSchemas,
    errors
  };
}

async function getShortcuts(lakehouseId, workspaceId, headers) {
  const urls = [
    `${FABRIC_API_BASE_URL}/workspaces/${workspaceId}/items/${lakehouseId}/shortcuts`,
    `${FABRIC_API_BASE_URL}/workspaces/items/${lakehouseId}/lakehouse/shortcuts`
  ];

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        headers,
        timeout: 30000
      });
      return response.data.value || [];
    } catch (error) {
      if (![400, 404].includes(error.response?.status)) {
        throw error;
      }
    }
  }

  return [];
}

async function createSchemaShortcutWithVariants({
  accessToken,
  sourceWorkspaceId,
  sourceLakehouseId,
  destinationWorkspaceId,
  destinationLakehouseId,
  schemaName,
  overwriteExisting = false
}) {
  const schemaNameCandidates = [schemaName, `${schemaName}_1`];
  const endpointVariants = [
    `${FABRIC_API_BASE_URL}/workspaces/${destinationWorkspaceId}/items/${destinationLakehouseId}/shortcuts`,
    `${FABRIC_API_BASE_URL}/workspaces/items/${destinationLakehouseId}/lakehouse/shortcuts`
  ];

  const errors = [];

  const isNameConflict = (errorItem) => {
    const status = errorItem?.status;
    const message = String(errorItem?.message || '').toLowerCase();
    const response = errorItem?.response || {};
    const detailText = Array.isArray(response?.moreDetails)
      ? response.moreDetails.map(detail => `${detail?.errorCode || ''} ${detail?.message || ''}`).join(' ').toLowerCase()
      : '';
    const codeText = `${response?.errorCode || ''}`.toLowerCase();
    return status === 409 && (message.includes('conflict') || detailText.includes('nameconflicterror') || detailText.includes('unique name conflict') || codeText.includes('entityconflict'));
  };

  for (let nameIndex = 0; nameIndex < schemaNameCandidates.length; nameIndex += 1) {
    const candidateName = schemaNameCandidates[nameIndex];
    const payloadVariants = [
      {
        name: candidateName,
        path: 'Tables',
        target: {
          oneLake: {
            workspaceId: sourceWorkspaceId,
            itemId: sourceLakehouseId,
            path: `Tables/${schemaName}`
          }
        }
      }
    ];

    const candidateErrors = [];

    for (const endpoint of endpointVariants) {
      for (let i = 0; i < payloadVariants.length; i += 1) {
        const payload = payloadVariants[i];
        try {
          const response = await axios.post(
            endpoint,
            payload,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              params: {
                shortcutConflictPolicy: overwriteExisting ? 'CreateOrOverwrite' : 'Abort'
              },
              timeout: 30000
            }
          );

          return {
            success: true,
            endpoint,
            payloadVariant: i + 1,
            data: response.data,
            createdShortcutName: candidateName,
            usedFallbackName: candidateName !== schemaName,
            errors
          };
        } catch (error) {
          const errorItem = {
            endpoint,
            payloadVariant: i + 1,
            status: error.response?.status || 'N/A',
            message: error.response?.data?.message || error.message,
            response: error.response?.data,
            requestedShortcutName: candidateName
          };
          errors.push(errorItem);
          candidateErrors.push(errorItem);
        }
      }
    }

    const shouldRetryWithSuffix = nameIndex === 0 && candidateErrors.some(isNameConflict);
    if (!shouldRetryWithSuffix) {
      break;
    }
  }

  return {
    success: false,
    errors
  };
}

async function deleteShortcutWithFallback({ accessToken, destinationWorkspaceId, destinationLakehouseId, schemaName }) {
  const encodedName = encodeURIComponent(schemaName);
  const encodedTablesSchema = encodeURIComponent(`Tables/${schemaName}`);

  const endpoints = [
    `${FABRIC_API_BASE_URL}/workspaces/${destinationWorkspaceId}/items/${destinationLakehouseId}/shortcuts/${encodedName}`,
    `${FABRIC_API_BASE_URL}/workspaces/${destinationWorkspaceId}/items/${destinationLakehouseId}/shortcuts/${encodedTablesSchema}`,
    `${FABRIC_API_BASE_URL}/workspaces/items/${destinationLakehouseId}/lakehouse/shortcuts/${encodedName}`,
    `${FABRIC_API_BASE_URL}/workspaces/items/${destinationLakehouseId}/lakehouse/shortcuts/${encodedTablesSchema}`
  ];

  for (const endpoint of endpoints) {
    try {
      await axios.delete(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 20000
      });
      return { deleted: true, endpoint };
    } catch (error) {
      if (![400, 404, 405].includes(error.response?.status)) {
        return {
          deleted: false,
          endpoint,
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        };
      }
    }
  }

  return { deleted: false, endpoint: null, message: 'No delete endpoint variant succeeded' };
}

async function testBackendMirror(accessToken, resolved) {
  logSection('TEST 1: Backend mirror endpoint /api/mirror/schema-shortcuts');

  try {
    const requestBody = {
      sourceLakehouseId: resolved.sourceLakehouse.id,
      destinationLakehouseId: resolved.destinationLakehouse.id,
      sourceWorkspaceId: resolved.sourceWorkspace.id,
      destinationWorkspaceId: resolved.destinationWorkspace.id,
      schemas: [],
      excludeSchemas: [],
      overwriteExisting: true
    };

    const response = await axios.post(`${BACKEND_BASE_URL}/api/mirror/schema-shortcuts`, requestBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ Backend mirror request accepted');
    console.log(`Job ID: ${response.data.jobId}`);

    const jobId = response.data.jobId;
    let attempts = 0;
    const maxAttempts = 45;

    while (attempts < maxAttempts) {
      attempts += 1;
      await new Promise(r => setTimeout(r, 2000));

      const jobResponse = await axios.get(`${BACKEND_BASE_URL}/api/mirror/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 30000
      });

      const job = jobResponse.data;
      console.log(`Attempt ${attempts}: status=${job.status}, progress=${job.progress}%, message=${job.message}`);

      if (job.status === 'completed') {
        console.log('✅ Backend mirror job completed');
        console.log(`Created: ${job.results?.created?.length || 0}`);
        console.log(`Failed: ${job.results?.failed?.length || 0}`);
        console.log(`Skipped: ${job.results?.skipped?.length || 0}`);
        return { ok: true, job };
      }

      if (job.status === 'failed') {
        console.log('❌ Backend mirror job failed');
        console.log(job.error || 'No error details');
        return { ok: false, job };
      }
    }

    console.log('⚠️ Backend mirror job did not finish in time');
    return { ok: false, job: null };
  } catch (error) {
    console.log('❌ Backend mirror test failed');
    console.log(`Status: ${error.response?.status || 'N/A'}`);
    console.log(`Message: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
    return { ok: false, job: null };
  }
}

function diffSchemas(sourceSchemaNames, destinationSchemaNames) {
  const src = new Set(sourceSchemaNames.map(normalizeName));
  const dst = new Set(destinationSchemaNames.map(normalizeName));

  const isSchemaSatisfiedByDestination = (schemaName) => {
    const normalized = normalizeName(schemaName);
    if (dst.has(normalized)) {
      return true;
    }
    return dst.has(`${normalized}_1`);
  };

  const missingInDestination = sourceSchemaNames.filter(name => !isSchemaSatisfiedByDestination(name));
  const extraInDestination = destinationSchemaNames.filter(name => !src.has(normalizeName(name)));

  return {
    missingInDestination: uniqueSorted(missingInDestination),
    extraInDestination: uniqueSorted(extraInDestination)
  };
}

function getEffectiveDestinationSchemaNames(shortcuts) {
  return uniqueSorted((shortcuts || []).map(s => s.name));
}

async function runSyncUntilMatch(accessToken, headers, resolved) {
  logSection('TEST 2: Direct sync loop until source schemas match destination shortcuts');

  const sourceSchemaLookup = await getSchemasWithFallback(
    resolved.sourceLakehouse.id,
    resolved.sourceWorkspace.id,
    headers
  );
  const sourceSchemaNames = sourceSchemaLookup.schemaNames;

  console.log(`Source schema discovery source: ${sourceSchemaLookup.source}`);
  console.log(`Source schema endpoint used: ${sourceSchemaLookup.resolvedUrl}`);
  console.log(`Source schema count: ${sourceSchemaNames.length}`);

  if (!sourceSchemaNames.length) {
    console.log('❌ No source schemas found (even with tables fallback). Cannot continue sync loop.');
    return { matched: false, sourceSchemaNames, destinationSchemaNames: [] };
  }

  if (TEST_DELETE_SHORTCUTS) {
    logSection('Optional cleanup: deleting matching destination shortcuts before sync');
    for (const schemaName of sourceSchemaNames) {
      const result = await deleteShortcutWithFallback({
        accessToken,
        destinationWorkspaceId: resolved.destinationWorkspace.id,
        destinationLakehouseId: resolved.destinationLakehouse.id,
        schemaName
      });
      if (result.deleted) {
        console.log(`Deleted shortcut '${schemaName}' via ${result.endpoint}`);
      }
    }
  }

  for (let round = 1; round <= MAX_SYNC_ROUNDS; round += 1) {
    console.log(`\n--- Sync round ${round}/${MAX_SYNC_ROUNDS} ---`);

    const destinationShortcuts = await getShortcuts(
      resolved.destinationLakehouse.id,
      resolved.destinationWorkspace.id,
      headers
    );
    const destinationSchemaNames = getEffectiveDestinationSchemaNames(destinationShortcuts);
    const diff = diffSchemas(sourceSchemaNames, destinationSchemaNames);

    console.log(`Destination shortcut count: ${destinationSchemaNames.length}`);
    console.log(`Missing in destination: ${diff.missingInDestination.length}`);

    if (diff.missingInDestination.length === 0) {
      console.log('✅ Source schemas match destination shortcuts.');
      return { matched: true, sourceSchemaNames, destinationSchemaNames };
    }

    for (const schemaName of diff.missingInDestination) {
      const createResult = await createSchemaShortcutWithVariants({
        accessToken,
        sourceWorkspaceId: resolved.sourceWorkspace.id,
        sourceLakehouseId: resolved.sourceLakehouse.id,
        destinationWorkspaceId: resolved.destinationWorkspace.id,
        destinationLakehouseId: resolved.destinationLakehouse.id,
        schemaName,
        overwriteExisting: true
      });

      if (createResult.success) {
        const suffixNote = createResult.usedFallbackName ? ` using fallback name '${createResult.createdShortcutName}'` : '';
        console.log(`✅ Created shortcut for schema '${schemaName}'${suffixNote} (endpoint variant success)`);
      } else {
        console.log(`❌ Failed to create shortcut for schema '${schemaName}'`);
        const firstError = createResult.errors[0];
        if (firstError) {
          console.log(`   First error: status=${firstError.status}, message=${firstError.message}`);
        }
      }
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  const destinationShortcuts = await getShortcuts(
    resolved.destinationLakehouse.id,
    resolved.destinationWorkspace.id,
    headers
  );
  const destinationSchemaNames = getEffectiveDestinationSchemaNames(destinationShortcuts);
  const finalDiff = diffSchemas(sourceSchemaNames, destinationSchemaNames);

  console.log(`Final missing in destination after ${MAX_SYNC_ROUNDS} rounds: ${finalDiff.missingInDestination.length}`);
  if (finalDiff.missingInDestination.length > 0) {
    console.log(`Missing schemas: ${finalDiff.missingInDestination.join(', ')}`);
  }

  return {
    matched: finalDiff.missingInDestination.length === 0,
    sourceSchemaNames,
    destinationSchemaNames
  };
}

async function run() {
  try {
    logSection('Shortcut creation tests using .env source/destination configuration');

    const sourceWorkspaceName = getRequiredEnv('SOURCE_WORKSPACE_NAME');
    const sourceLakehouseName = getRequiredEnv('SOURCE_LAKEHOUSE_NAME');
    const destinationWorkspaceName = getRequiredEnv('DESTINATION_WORKSPACE_NAME');
    const destinationLakehouseName = getRequiredEnv('DESTINATION_LAKEHOUSE_NAME');

    console.log('Source Workspace:', sourceWorkspaceName);
    console.log('Source Lakehouse:', sourceLakehouseName);
    console.log('Destination Workspace:', destinationWorkspaceName);
    console.log('Destination Lakehouse:', destinationLakehouseName);
    console.log('TEST_DELETE_SHORTCUTS:', TEST_DELETE_SHORTCUTS);
    console.log('MAX_SYNC_ROUNDS:', MAX_SYNC_ROUNDS);
    console.log('ENABLE_TABLE_PARITY_VALIDATION:', ENABLE_TABLE_PARITY_VALIDATION);
    console.log('ONELAKE_TABLE_API_BASE_URL:', ONELAKE_TABLE_API_BASE_URL);
    console.log('ONELAKE_TABLE_API_SCOPE:', ONELAKE_TABLE_API_SCOPE);

    const accessToken = await getAccessToken();
    const tokenPayload = decodeJwt(accessToken);

    console.log('\nToken audience:', tokenPayload?.aud);
    console.log('Token roles:', tokenPayload?.roles?.join(', ') || 'none');

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };

    const workspaces = await getWorkspaces(headers);
    const sourceWorkspace = pickByName(workspaces, sourceWorkspaceName);
    const destinationWorkspace = pickByName(workspaces, destinationWorkspaceName);

    if (!sourceWorkspace) throw new Error(`Source workspace not found by name: ${sourceWorkspaceName}`);
    if (!destinationWorkspace) throw new Error(`Destination workspace not found by name: ${destinationWorkspaceName}`);

    const sourceLakehouses = await getLakehouses(sourceWorkspace.id, headers);
    const destinationLakehouses = await getLakehouses(destinationWorkspace.id, headers);

    const sourceLakehouse = pickByName(sourceLakehouses, sourceLakehouseName);
    const destinationLakehouse = pickByName(destinationLakehouses, destinationLakehouseName);

    if (!sourceLakehouse) throw new Error(`Source lakehouse not found by name: ${sourceLakehouseName}`);
    if (!destinationLakehouse) throw new Error(`Destination lakehouse not found by name: ${destinationLakehouseName}`);

    const resolved = {
      sourceWorkspace: { id: sourceWorkspace.id, name: sourceWorkspace.displayName || sourceWorkspace.name },
      sourceLakehouse: { id: sourceLakehouse.id, name: sourceLakehouse.displayName || sourceLakehouse.name },
      destinationWorkspace: { id: destinationWorkspace.id, name: destinationWorkspace.displayName || destinationWorkspace.name },
      destinationLakehouse: { id: destinationLakehouse.id, name: destinationLakehouse.displayName || destinationLakehouse.name }
    };

    logSection('Resolved IDs from .env names');
    console.log(JSON.stringify(resolved, null, 2));

    await testBackendMirror(accessToken, resolved);
    const syncResult = await runSyncUntilMatch(accessToken, headers, resolved);
    const tableParityResult = await runTableParityPass(resolved, syncResult.sourceSchemaNames);

    logSection('Final Result');
    console.log(`Source schema count: ${syncResult.sourceSchemaNames.length}`);
    console.log(`Destination shortcut/schema count: ${syncResult.destinationSchemaNames.length}`);
    console.log(`Schema match status: ${syncResult.matched ? 'MATCHED' : 'NOT MATCHED'}`);
    console.log(`Table parity status: ${tableParityResult.skipped ? `SKIPPED (${tableParityResult.reason})` : (tableParityResult.matched ? 'MATCHED' : 'NOT MATCHED')}`);

    if (!syncResult.matched) {
      process.exitCode = 1;
    }

    if (!tableParityResult.skipped && !tableParityResult.matched) {
      process.exitCode = 1;
    }
  } catch (error) {
    logSection('Test execution failed');
    console.log(error.message);
    if (error.response?.data) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    process.exitCode = 1;
  }
}

run();
