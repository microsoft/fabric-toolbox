const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('🔍 FRONTEND AUTHENTICATION FLOW ANALYZER');
console.log('========================================\n');

/**
 * Test the frontend authentication configuration
 */
async function analyzeFrontendAuthConfig() {
  console.log('📋 Step 1: Checking frontend auth configuration...');
  
  try {
    // Test the auth config endpoint
    const configResponse = await axios.get('http://localhost:3001/api/auth/config');
    console.log('✅ Auth config retrieved:');
    console.log('   Config:', JSON.stringify(configResponse.data, null, 2));
    
    // Validate the scopes
    const scopes = configResponse.data.scopes || [];
    const expectedFabricScopes = [
      'https://api.fabric.microsoft.com/Item.ReadWrite.All',
      'https://api.fabric.microsoft.com/Workspace.ReadWrite.All'
    ];
    
    console.log('\n🔍 Scope Analysis:');
    expectedFabricScopes.forEach(scope => {
      if (scopes.includes(scope)) {
        console.log(`   ✅ ${scope}`);
      } else {
        console.log(`   ❌ Missing: ${scope}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Could not retrieve auth config:', error.message);
  }
}

/**
 * Test backend endpoints without token (should return proper 401)
 */
async function testBackendAuthRequirement() {
  console.log('\n🔐 Step 2: Testing backend authentication requirements...');
  
  const endpoints = [
    '/api/workspaces',
    '/api/auth/me',
    '/api/debug/token-info'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`http://localhost:3001${endpoint}`, {
        validateStatus: () => true // Accept all status codes
      });
      
      if (response.status === 401) {
        console.log(`✅ ${endpoint} - Correctly requires authentication (401)`);
      } else {
        console.log(`⚠️  ${endpoint} - Unexpected status: ${response.status}`);
      }
      
    } catch (error) {
      console.error(`❌ ${endpoint} - Request failed:`, error.message);
    }
  }
}

/**
 * Test with Authorization header format variations
 */
async function testAuthHeaderFormats() {
  console.log('\n📨 Step 3: Testing Authorization header formats...');
  
  const testToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.test.payload';
  
  const headerVariations = [
    { name: 'Standard Bearer', header: `Bearer ${testToken}` },
    { name: 'No Bearer prefix', header: testToken },
    { name: 'Lowercase bearer', header: `bearer ${testToken}` },
    { name: 'Extra spaces', header: `Bearer  ${testToken}` }
  ];
  
  for (const variation of headerVariations) {
    try {
      const response = await axios.get('http://localhost:3001/api/workspaces', {
        headers: {
          'Authorization': variation.header
        },
        validateStatus: () => true
      });
      
      console.log(`${variation.name}: ${response.status} - ${response.data?.error || response.data?.message || 'OK'}`);
      
    } catch (error) {
      console.log(`${variation.name}: Failed - ${error.message}`);
    }
  }
}

/**
 * Check if frontend is properly running and reachable
 */
async function checkFrontendStatus() {
  console.log('\n🌐 Step 4: Checking frontend status...');
  
  try {
    // Test if frontend is serving content
    const frontendResponse = await axios.get('http://localhost:3000', {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (frontendResponse.status === 200) {
      console.log('✅ Frontend is serving content');
      
      // Check if it contains React app indicators
      const html = frontendResponse.data;
      if (html.includes('react') || html.includes('root')) {
        console.log('✅ Appears to be a React application');
      } else {
        console.log('⚠️  May not be the expected React app');
      }
      
    } else {
      console.log(`⚠️  Frontend returned status: ${frontendResponse.status}`);
    }
    
  } catch (error) {
    console.error('❌ Could not reach frontend:', error.message);
    console.log('💡 Make sure you ran: npm start in the client directory');
  }
}

/**
 * Test CORS configuration
 */
async function testCorsConfiguration() {
  console.log('\n🌍 Step 5: Testing CORS configuration...');
  
  try {
    // Make a preflight request (OPTIONS) 
    const corsResponse = await axios.options('http://localhost:3001/api/workspaces', {
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type'
      },
      validateStatus: () => true
    });
    
    console.log(`CORS preflight response: ${corsResponse.status}`);
    
    const corsHeaders = corsResponse.headers;
    console.log('📋 CORS Headers:');
    console.log(`   • Access-Control-Allow-Origin: ${corsHeaders['access-control-allow-origin'] || 'Not set'}`);
    console.log(`   • Access-Control-Allow-Methods: ${corsHeaders['access-control-allow-methods'] || 'Not set'}`);
    console.log(`   • Access-Control-Allow-Headers: ${corsHeaders['access-control-allow-headers'] || 'Not set'}`);
    
    // Check if authorization header is allowed
    const allowedHeaders = corsHeaders['access-control-allow-headers'] || '';
    if (allowedHeaders.toLowerCase().includes('authorization')) {
      console.log('✅ Authorization header is allowed by CORS');
    } else {
      console.log('❌ Authorization header may not be allowed by CORS');
    }
    
  } catch (error) {
    console.error('❌ CORS test failed:', error.message);
  }
}

/**
 * Generate debugging instructions
 */
function generateDebuggingInstructions() {
  console.log('\n📋 DEBUGGING INSTRUCTIONS FOR "No access token provided" ERROR:');
  console.log('================================================================');
  
  console.log('\n🔍 Frontend Debug Steps:');
  console.log('1. Open http://localhost:3000 in browser');
  console.log('2. Open Developer Tools (F12) → Network tab');
  console.log('3. Sign in and try to load workspaces');
  console.log('4. Look for the failed request to /api/workspaces');
  console.log('5. Check Request Headers - is "Authorization: Bearer <token>" present?');
  
  console.log('\n🔧 Common Fixes:');
  console.log('• If NO Authorization header: Frontend not sending token');
  console.log('• If Authorization header empty: Token acquisition failed');
  console.log('• If Authorization header malformed: Check Bearer prefix');
  console.log('• If token looks ok: Backend middleware issue');
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Run automated test: node server/automated-test.js');
  console.log('2. Check browser console for JavaScript errors');
  console.log('3. Verify you signed out and back in with new Fabric scopes');
  console.log('4. Test debug endpoint: http://localhost:3001/api/debug/token-info');
}

/**
 * Main analysis function
 */
async function runFrontendAnalysis() {
  await analyzeFrontendAuthConfig();
  await testBackendAuthRequirement();
  await testAuthHeaderFormats();
  await checkFrontendStatus();
  await testCorsConfiguration();
  generateDebuggingInstructions();
  
  console.log('\n✅ Frontend authentication analysis complete!');
}

// Run the analysis
runFrontendAnalysis().catch(console.error);