const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('🔐 AUTOMATED FABRIC API TESTING WITH REAL CREDENTIALS');
console.log('====================================================\n');

/**
 * Get access token using client credentials flow
 */
async function getAccessToken() {
  console.log('🎫 Step 1: Getting access token...');
  
  const tokenUrl = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    scope: 'https://api.fabric.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  try {
    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('✅ Token acquired successfully');
    console.log(`   • Token type: ${response.data.token_type}`);
    console.log(`   • Expires in: ${response.data.expires_in} seconds`);
    console.log(`   • Scope: ${response.data.scope || 'Not provided'}`);
    
    return response.data.access_token;
    
  } catch (error) {
    console.error('❌ Token acquisition failed:');
    console.error(`   • Status: ${error.response?.status}`);
    console.error(`   • Error: ${error.response?.data?.error}`);
    console.error(`   • Description: ${error.response?.data?.error_description}`);
    throw error;
  }
}

/**
 * Test Fabric API endpoints
 */
async function testFabricAPIs(accessToken) {
  console.log('\n🧪 Step 2: Testing Fabric API endpoints...');
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // Test 1: List Workspaces
  console.log('\n📋 Test 1: GET /workspaces');
  console.log(`URL: ${process.env.FABRIC_API_BASE_URL}/workspaces`);
  
  try {
    const workspacesResponse = await axios.get(
      `${process.env.FABRIC_API_BASE_URL}/workspaces`,
      { headers, timeout: 15000 }
    );
    
    console.log('✅ Workspaces API Success');
    console.log(`   • Status: ${workspacesResponse.status}`);
    console.log(`   • Workspaces found: ${workspacesResponse.data.value?.length || 0}`);
    
    if (workspacesResponse.data.value && workspacesResponse.data.value.length > 0) {
      console.log('\n📊 First 3 workspaces:');
      workspacesResponse.data.value.slice(0, 3).forEach((ws, i) => {
        console.log(`   ${i + 1}. ${ws.displayName || ws.name} (${ws.id})`);
      });
      
      // Test 2: Get items in first workspace
      const firstWorkspace = workspacesResponse.data.value[0];
      console.log(`\n🏠 Test 2: GET /workspaces/${firstWorkspace.id}/items`);
      
      try {
        const itemsResponse = await axios.get(
          `${process.env.FABRIC_API_BASE_URL}/workspaces/${firstWorkspace.id}/items`,
          { headers, timeout: 15000 }
        );
        
        console.log('✅ Items API Success');
        console.log(`   • Status: ${itemsResponse.status}`);
        console.log(`   • Items found: ${itemsResponse.data.value?.length || 0}`);
        
        // Count lakehouses
        const lakehouses = itemsResponse.data.value?.filter(item => item.type === 'Lakehouse') || [];
        console.log(`   • Lakehouses: ${lakehouses.length}`);
        
        if (lakehouses.length > 0) {
          console.log('\n🏠 First 3 lakehouses:');
          lakehouses.slice(0, 3).forEach((lh, i) => {
            console.log(`   ${i + 1}. ${lh.displayName || lh.name} (${lh.id})`);
          });
        }
        
      } catch (itemsError) {
        console.error('❌ Items API Failed:');
        console.error(`   • Status: ${itemsError.response?.status}`);
        console.error(`   • Error: ${itemsError.response?.data}`);
      }
    } else {
      console.log('⚠️  No workspaces found - this might be expected if you don\'t have any');
    }
    
  } catch (workspacesError) {
    console.error('❌ Workspaces API Failed:');
    console.error(`   • Status: ${workspacesError.response?.status}`);
    console.error(`   • Status Text: ${workspacesError.response?.statusText}`);
    
    if (workspacesError.response?.data) {
      console.error('   • Response Data:', JSON.stringify(workspacesError.response.data, null, 4));
    }
    
    // Common error analysis 
    const status = workspacesError.response?.status;
    if (status === 401) {
      console.error('\n💡 401 Unauthorized - Possible causes:');
      console.error('   • Token is invalid or expired');
      console.error('   • Wrong audience in token');
      console.error('   • App registration not properly configured');
    } else if (status === 403) {
      console.error('\n💡 403 Forbidden - Possible causes:');
      console.error('   • Missing required permissions in app registration');
      console.error('   • Fabric not enabled in tenant');
      console.error('   • User/app doesn\'t have access to any workspaces');
    }
  }
}

/**
 * Test our backend with the obtained token
 */
async function testBackendWithToken(accessToken) {
  console.log('\n🔧 Step 3: Testing backend with real token...');
  
  try {
    // Test backend workspace endpoint
    const backendResponse = await axios.get('http://localhost:3001/api/workspaces', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Backend API Success');
    console.log(`   • Status: ${backendResponse.status}`);
    console.log(`   • Workspaces: ${backendResponse.data.workspaces?.length || 0}`);
    
  } catch (backendError) {
    console.error('❌ Backend API Failed:');
    console.error(`   • Status: ${backendError.response?.status}`);
    console.error(`   • Error: ${backendError.response?.data?.error}`);
    console.error(`   • Message: ${backendError.response?.data?.message}`);
    
    if (backendError.response?.data) {
      console.error('   • Full response:', JSON.stringify(backendError.response.data, null, 4));
    }
  }
}

/**
 * Validate token structure
 */
function analyzeToken(token) {
  console.log('\n🔍 Step 4: Analyzing token structure...');
  
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    console.log('🎫 Token Details:');
    console.log(`   • Audience (aud): ${payload.aud}`);
    console.log(`   • Issuer (iss): ${payload.iss}`);
    console.log(`   • App ID (appid): ${payload.appid || 'Not found'}`);
    console.log(`   • Tenant (tid): ${payload.tid}`);
    console.log(`   • Expires: ${new Date(payload.exp * 1000).toISOString()}`);
    console.log(`   • Issued at: ${new Date(payload.iat * 1000).toISOString()}`);
    console.log(`   • Scopes (scp): ${payload.scp || 'Not found'}`);
    console.log(`   • Roles: ${payload.roles ? payload.roles.join(', ') : 'None'}`);
    
    // Validate expected values
    const expectedAudience = 'https://api.fabric.microsoft.com/';
    if (payload.aud === expectedAudience) {
      console.log('✅ Token audience is correct for Fabric API');
    } else {
      console.log(`⚠️  Token audience mismatch. Expected: ${expectedAudience}, Got: ${payload.aud}`);
    }
    
  } catch (error) {
    console.error('❌ Could not analyze token:', error.message);
  }
}

/**
 * Main test function
 */
async function runAutomatedTests() {
  console.log('📋 Configuration:');
  console.log(`   • Client ID: ${process.env.CLIENT_ID || '❌ Missing'}`);
  console.log(`   • Client Secret: ${process.env.CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   • Tenant ID: ${process.env.TENANT_ID || '❌ Missing'}`);
  console.log(`   • Fabric API: ${process.env.FABRIC_API_BASE_URL || '❌ Missing'}`);
  
  // Validate required environment variables
  const required = ['CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID', 'FABRIC_API_BASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variables: ${missing.join(', ')}`);
    return;
  }
  
  try {
    // Step 1: Get access token
    const accessToken = await getAccessToken();
    
    // Step 2: Analyze token
    analyzeToken(accessToken);
    
    // Step 3: Test Fabric APIs directly
    await testFabricAPIs(accessToken);
    
    // Step 4: Test backend with token
    await testBackendWithToken(accessToken);
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('\n💥 Test execution failed:', error.message);
  }
}

// Run the tests
runAutomatedTests().catch(console.error);