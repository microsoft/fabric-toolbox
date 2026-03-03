const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  const ws = '0193571d-52dc-4dd4-8579-d8d02c5b43ad';
  const lh = '481e898d-2180-4b68-88a7-5f0c5d5375e0';

  const token = (await axios.post(
    `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope: 'https://api.fabric.microsoft.com/.default',
      grant_type: 'client_credentials'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )).data.access_token;

  const headers = { Authorization: `Bearer ${token}` };

  const candidates = [
    `/workspaces/${ws}/lakehouses/${lh}/schemas`,
    `/workspaces/${ws}/lakehouses/${lh}/schema`,
    `/workspaces/${ws}/lakehouses/${lh}/tables?includeSchemas=true`,
    `/workspaces/${ws}/lakehouses/${lh}/tables?schemasEnabled=true`,
    `/workspaces/${ws}/lakehouses/${lh}/tables?schema=dbo`,
    `/workspaces/${ws}/lakehouses/${lh}/tables?schemaName=dbo`,
    `/workspaces/${ws}/lakehouses/${lh}/schemas/dbo/tables`,
    `/workspaces/${ws}/lakehouses/${lh}/schema/dbo/tables`,
    `/workspaces/${ws}/lakehouses/${lh}/tables/dbo`,
    `/workspaces/${ws}/items/${lh}/schemasEnabled`,
    `/workspaces/${ws}/items/${lh}/tables?schema=dbo`,
    `/workspaces/${ws}/items/${lh}/schema/dbo/tables`,
    `/workspaces/${ws}/items/${lh}/schemas/dbo/tables`,
    `/workspaces/items/${lh}/lakehouse/schemas/dbo/tables`,
    `/workspaces/items/${lh}/lakehouse/schema/dbo/tables`,
    `/workspaces/items/${lh}/lakehouse/tables?schema=dbo`,
    `/workspaces/items/${lh}/lakehouse/tables?schemaName=dbo`,
    `/workspaces/items/${lh}/lakehouse/tables?includeSchemas=true`,
    `/workspaces/${ws}/items/${lh}/tables`,
    `/workspaces/${ws}/items/${lh}/schemas`,
    `/workspaces/${ws}/items/${lh}/shortcuts`
  ];

  for (const p of candidates) {
    const url = `${process.env.FABRIC_API_BASE_URL}${p}`;
    try {
      const r = await axios.get(url, { headers, timeout: 20000 });
      const count = Array.isArray(r.data?.value) ? r.data.value.length : 'n/a';
      console.log(`OK  ${r.status} ${p} count=${count}`);
    } catch (e) {
      console.log(`ERR ${e.response?.status || 'N/A'} ${p} :: ${e.response?.data?.errorCode || ''} ${e.response?.data?.message || e.message}`);
    }
  }
})();
