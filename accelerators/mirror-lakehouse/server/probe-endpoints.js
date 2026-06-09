const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  try {
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        scope: 'https://api.fabric.microsoft.com/.default',
        grant_type: 'client_credentials'
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const token = tokenResponse.data.access_token;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const ws = '0193571d-52dc-4dd4-8579-d8d02c5b43ad';
    const sourceLh = '481e898d-2180-4b68-88a7-5f0c5d5375e0';
    const destLh = '08514f90-6f8f-4e42-b7d2-31c2b3f4b333';

    const urls = [
      `${process.env.FABRIC_API_BASE_URL}/workspaces`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items?type=Lakehouse`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${sourceLh}/lakehouse/tables`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${sourceLh}/lakehouse/schemas`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${sourceLh}/lakehouse/shortcuts`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/items/${destLh}/lakehouse/shortcuts`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}/lakehouse/tables`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}/lakehouse/schemas`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${destLh}/shortcuts`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}?$expand=definition`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/lakehouses/${sourceLh}/tables`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/lakehouses/${sourceLh}/schemas`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/lakehouses/${sourceLh}/shortcuts`,
      `${process.env.FABRIC_API_BASE_URL}/lakehouses/${sourceLh}/tables`,
      `${process.env.FABRIC_API_BASE_URL}/lakehouses/${sourceLh}/schemas`,
      `${process.env.FABRIC_API_BASE_URL}/lakehouses/${sourceLh}/shortcuts`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}/tables`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}/schemas`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}/lakehouse`,
      `${process.env.FABRIC_API_BASE_URL}/workspaces/${ws}/items/${sourceLh}/shortcuts`
    ];

    for (const url of urls) {
      try {
        const response = await axios.get(url, { headers, timeout: 30000 });
        const count = Array.isArray(response.data?.value) ? response.data.value.length : 'n/a';
        console.log(`OK   ${response.status} ${url} (count=${count})`);
      } catch (error) {
        console.log(
          `ERR  ${error.response?.status || 'N/A'} ${url} :: ${error.response?.data?.errorCode || ''} ${error.response?.data?.message || error.message}`
        );
      }
    }
  } catch (error) {
    console.error('Probe failed:', error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    process.exitCode = 1;
  }
})();
