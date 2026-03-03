const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function getToken(scope) {
  return (await axios.post(
    `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      scope,
      grant_type: 'client_credentials'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )).data.access_token;
}

(async () => {
  const wsId = '0193571d-52dc-4dd4-8579-d8d02c5b43ad';
  const lhId = '481e898d-2180-4b68-88a7-5f0c5d5375e0';
  const lhName = 'test';

  const tokenScopes = [
    'https://api.fabric.microsoft.com/.default',
    'https://onelake.table.fabric.microsoft.com/.default'
  ];

  const candidates = [
    `https://onelake.table.fabric.microsoft.com/delta/${wsId}/${lhId}/api/2.1/unity-catalog/schemas?catalog_name=${lhId}`,
    `https://onelake.table.fabric.microsoft.com/delta/${wsId}/${lhId}/api/2.1/unity-catalog/schemas?catalog_name=${lhName}.Lakehouse`,
    `https://onelake.table.fabric.microsoft.com/delta/${wsId}/${lhName}.Lakehouse/api/2.1/unity-catalog/schemas?catalog_name=${lhName}.Lakehouse`,
    `https://onelake.table.fabric.microsoft.com/delta/${wsId}/${lhId}/api/2.1/unity-catalog/schemas`,
    `https://onelake.table.fabric.microsoft.com/delta/${wsId}/${lhId}/api/2.1/unity-catalog/tables?catalog_name=${lhName}.Lakehouse&schema_name=dbo`
  ];

  for (const scope of tokenScopes) {
    let token;
    try {
      token = await getToken(scope);
      console.log('TOKEN OK', scope);
    } catch (error) {
      console.log('TOKEN ERR', scope, error.response?.data?.error_description || error.message);
      console.log('---');
      continue;
    }

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    for (const url of candidates) {
      try {
        const response = await axios.get(url, { headers, timeout: 30000 });
        console.log('OK', response.status, scope, url);
        console.log(JSON.stringify(response.data, null, 2));
      } catch (error) {
        console.log('ERR', error.response?.status || 'N/A', scope, url);
        console.log(error.response?.data?.message || JSON.stringify(error.response?.data || { message: error.message }));
      }
      console.log('---');
    }
  }
})();
