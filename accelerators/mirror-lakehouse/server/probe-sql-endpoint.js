const axios = require('axios');
const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function getToken(scope) {
  const response = await axios.post(
    `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope,
      grant_type: 'client_credentials'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data.access_token;
}

async function main() {
  const workspaceId = process.env.SOURCE_WORKSPACE_ID || '0193571d-52dc-4dd4-8579-d8d02c5b43ad';
  const lakehouseId = process.env.SOURCE_LAKEHOUSE_ID || '481e898d-2180-4b68-88a7-5f0c5d5375e0';

  const fabricToken = await getToken('https://api.fabric.microsoft.com/.default');
  const metadata = (
    await axios.get(
      `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/lakehouses/${lakehouseId}`,
      { headers: { Authorization: `Bearer ${fabricToken}` } }
    )
  ).data;

  const server = metadata?.properties?.sqlEndpointProperties?.connectionString;
  const endpointId = metadata?.properties?.sqlEndpointProperties?.id;
  const displayName = metadata?.displayName;

  console.log('Resolved SQL endpoint server:', server);
  console.log('Lakehouse displayName:', displayName);
  console.log('SQL endpoint id:', endpointId);

  const sqlToken = await getToken('https://database.windows.net/.default');
  const dbCandidates = [displayName, lakehouseId, endpointId].filter(Boolean);

  for (const database of dbCandidates) {
    let pool;
    try {
      pool = await sql.connect({
        server,
        database,
        options: {
          encrypt: true,
          trustServerCertificate: false
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

      const result = await pool.request().query(`
        SELECT TOP 20
          TABLE_SCHEMA AS schemaName,
          TABLE_NAME AS tableName
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
      `);

      console.log(`OK database='${database}' rows=${result.recordset.length}`);
      console.log(JSON.stringify(result.recordset.slice(0, 10), null, 2));
    } catch (error) {
      console.log(`ERR database='${database}' code=${error.code || 'N/A'} message=${error.message}`);
    } finally {
      if (pool) {
        await pool.close();
      }
    }
  }
}

main().catch(error => {
  console.error('Probe failed:', error.message);
  process.exitCode = 1;
});
