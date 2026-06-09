const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Test script to verify our backend API routes
console.log('🧪 Testing Backend API Routes...\n');

async function testBackendRoutes() {
  const backendUrl = 'http://localhost:3001';
  
  // Test 1: Health check (no auth required)
  console.log('🏥 Test 1: Health Check...');
  try {
    const healthResponse = await axios.get(`${backendUrl}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    console.log('💡 Make sure the backend is running: npm start');
    return;
  }

  // Test 2: Workspace endpoint without auth (should return 401)
  console.log('\n🏢 Test 2: Workspaces without authentication...');
  try {
    const response = await axios.get(`${backendUrl}/api/workspaces`, {
      validateStatus: () => true
    });
    
    if (response.status === 401) {
      console.log('✅ Correctly returns 401 Unauthorized without token');
    } else {
      console.log('⚠️  Unexpected response:', response.status, response.data);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }

  // Test 3: Test with invalid token
  console.log('\n🔑 Test 3: Invalid token handling...');
  try {
    const response = await axios.get(`${backendUrl}/api/workspaces`, {
      headers: {
        'Authorization': 'Bearer invalid_token_here'
      },
      validateStatus: () => true
    });
    
    if (response.status === 401) {
      console.log('✅ Correctly rejects invalid token');
    } else {
      console.log('⚠️  Unexpected response:', response.status, response.data);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }

  // Test 4: Generate a test JWT token for debugging
  console.log('\n🔧 Test 4: JWT Token Structure Test...');
  
  // Create a mock JWT payload (for testing structure only)
  const mockPayload = {
    aud: 'https://api.fabric.microsoft.com',
    iss: `https://sts.windows.net/${process.env.TENANT_ID}/`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    oid: 'test-user-id',
    preferred_username: 'test@example.com',
    name: 'Test User',
    tid: process.env.TENANT_ID,
    scp: 'https://api.fabric.microsoft.com/Item.ReadWrite.All https://api.fabric.microsoft.com/Workspace.ReadWrite.All'
  };

  const encodedPayload = Buffer.from(JSON.stringify(mockPayload)).toString('base64');
  const mockToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${encodedPayload}.mock_signature`;
  
  console.log('🔍 Mock token structure:');
  console.log('   • Audience:', mockPayload.aud);
  console.log('   • Scopes:', mockPayload.scp);
  console.log('   • Expires:', new Date(mockPayload.exp * 1000).toISOString());

  // Test 5: Check authentication middleware with mock token
  console.log('\n🔐 Test 5: Authentication middleware test...');
  try {
    const response = await axios.get(`${backendUrl}/api/workspaces`, {
      headers: {
        'Authorization': `Bearer ${mockToken}`
      },
      validateStatus: () => true
    });
    
    console.log(`Response status: ${response.status}`);
    if (response.status === 401) {
      console.log('✅ Authentication middleware is working (rejects mock token)');
    } else if (response.status === 403) {
      console.log('✅ Token accepted but insufficient permissions (expected for mock token)');
    } else if (response.status >= 400) {
      console.log('📄 Error response:', response.data);
    } else {
      console.log('⚠️  Unexpected success - this shouldn\'t happen with a mock token');
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }

  // Test 6: Check what scopes are being validated
  console.log('\n📋 Test 6: Required scopes check...');
  console.log('Current workspace route requires scopes:');
  console.log('   • https://api.fabric.microsoft.com/Workspace.ReadWrite.All');
  console.log('\nCurrent lakehouse route requires scopes:');
  console.log('   • https://api.fabric.microsoft.com/Item.Read.All');
  console.log('\nCurrent authentication service should request:');
  console.log('   • https://api.fabric.microsoft.com/Item.ReadWrite.All');
  console.log('   • https://api.fabric.microsoft.com/Workspace.ReadWrite.All');

  // Test 7: Check auth config endpoint
  console.log('\n⚙️  Test 7: Auth config endpoint...');
  try {
    const configResponse = await axios.get(`${backendUrl}/api/auth/config`);
    console.log('✅ Auth config:', configResponse.data);
  } catch (error) {
    console.error('❌ Auth config failed:', error.message);
  }
}

testBackendRoutes().catch(console.error);