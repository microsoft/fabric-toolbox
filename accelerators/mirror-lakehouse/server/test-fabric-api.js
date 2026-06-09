const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Test script to validate Fabric REST API calls
async function testFabricAPIs() {
  console.log('🧪 Testing Fabric REST API Integration...\n');
  
  // You'll need to provide a valid access token here
  // Get this from your browser's developer tools when logged in
  const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN_HERE'; // Replace with actual token
  
  const headers = {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    // Test 1: List Workspaces
    console.log('📋 Test 1: Listing Workspaces...');
    console.log(`URL: ${process.env.FABRIC_API_BASE_URL}/workspaces`);
    
    const workspacesResponse = await axios.get(
      `${process.env.FABRIC_API_BASE_URL}/workspaces`,
      { headers }
    );
    
    console.log('✅ Workspaces API Success');
    console.log(`📊 Found ${workspacesResponse.data.value?.length || 0} workspaces`);
    
    if (workspacesResponse.data.value && workspacesResponse.data.value.length > 0) {
      const firstWorkspace = workspacesResponse.data.value[0];
      console.log(`🏢 First workspace: ${firstWorkspace.displayName || firstWorkspace.name} (${firstWorkspace.id})`);
      
      // Test 2: List Lakehouses in first workspace
      console.log(`\n🏠 Test 2: Listing Lakehouses in workspace ${firstWorkspace.id}...`);
      console.log(`URL: ${process.env.FABRIC_API_BASE_URL}/workspaces/${firstWorkspace.id}/items?type=Lakehouse`);
      
      try {
        const lakehousesResponse = await axios.get(
          `${process.env.FABRIC_API_BASE_URL}/workspaces/${firstWorkspace.id}/items?type=Lakehouse`,
          { headers }
        );
        
        console.log('✅ Lakehouses API Success');
        console.log(`🏠 Found ${lakehousesResponse.data.value?.length || 0} lakehouses`);
        
        if (lakehousesResponse.data.value && lakehousesResponse.data.value.length > 0) {
          lakehousesResponse.data.value.forEach((lakehouse, index) => {
            console.log(`   ${index + 1}. ${lakehouse.displayName} (${lakehouse.id})`);
          });
        }
        
      } catch (lakehouseError) {
        console.error('❌ Lakehouses API Failed:', lakehouseError.response?.status, lakehouseError.response?.statusText);
        if (lakehouseError.response?.data) {
          console.error('📄 Error Details:', JSON.stringify(lakehouseError.response.data, null, 2));
        }
      }
    }
    
  } catch (workspaceError) {
    console.error('❌ Workspaces API Failed:', workspaceError.response?.status, workspaceError.response?.statusText);
    if (workspaceError.response?.data) {
      console.error('📄 Error Details:', JSON.stringify(workspaceError.response.data, null, 2));
    }
  }
}

// Test token validation
function testTokenStructure(token) {
  if (!token || token === 'YOUR_ACCESS_TOKEN_HERE') {
    console.log('⚠️  Please replace YOUR_ACCESS_TOKEN_HERE with a real access token');
    console.log('📝 To get a token:');
    console.log('   1. Open your browser\'s Developer Tools (F12)');
    console.log('   2. Go to Network tab');
    console.log('   3. Sign into your app and try to load workspaces');
    console.log('   4. Find a request with "Bearer" in the Authorization header');
    console.log('   5. Copy the token (without "Bearer " prefix)');
    return false;
  }
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.log('❌ Invalid token format (should have 3 parts separated by dots)');
      return false;
    }
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('🔍 Token Info:');
    console.log(`   • Audience: ${payload.aud}`);
    console.log(`   • Issuer: ${payload.iss}`);
    console.log(`   • Expires: ${new Date(payload.exp * 1000).toISOString()}`);
    console.log(`   • Scopes: ${payload.scp || 'Not found'}`);
    
    return true;
  } catch (error) {
    console.log('❌ Could not decode token:', error.message);
    return false;
  }
}

// Environment validation
console.log('🔧 Environment Check:');
console.log(`   • FABRIC_API_BASE_URL: ${process.env.FABRIC_API_BASE_URL}`);
console.log(`   • CLIENT_ID: ${process.env.CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`   • TENANT_ID: ${process.env.TENANT_ID ? '✅ Set' : '❌ Missing'}`);

// Run tests
const token = 'YOUR_ACCESS_TOKEN_HERE'; // Replace this!
if (testTokenStructure(token)) {
  testFabricAPIs();
}