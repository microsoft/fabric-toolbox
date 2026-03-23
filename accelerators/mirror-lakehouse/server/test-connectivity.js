const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('🧪 Testing Fabric API Endpoints (No Auth Required)...\n');

async function testEndpoints() {
  const baseUrl = process.env.FABRIC_API_BASE_URL || 'https://api.fabric.microsoft.com/v1';
  
  console.log('🔧 Configuration:');
  console.log(`   • Base URL: ${baseUrl}`);
  console.log(`   • Client ID: ${process.env.CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   • Tenant ID: ${process.env.TENANT_ID ? '✅ Set' : '❌ Missing'}\n`);

  // Test 1: Check if Fabric API is reachable (should return 401 without auth)
  console.log('📡 Test 1: Fabric API Connectivity...');
  try {
    const response = await axios.get(`${baseUrl}/workspaces`, {
      timeout: 10000,
      validateStatus: () => true // Accept all status codes
    });
    
    console.log(`✅ Fabric API Response: ${response.status} ${response.statusText}`);
    
    if (response.status === 401) {
      console.log('✅ Expected 401 - API is reachable but requires authentication');
      
      // Check WWW-Authenticate header for proper authentication requirements  
      const authHeader = response.headers['www-authenticate'];
      if (authHeader) {
        console.log('🔐 Authentication info:', authHeader);
      }
    } else {
      console.log('⚠️  Unexpected status code');
      console.log('Response:', response.data);
    }
    
  } catch (error) {
    console.error('❌ Fabric API Connectivity Failed:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('🌐 DNS resolution failed - check if api.fabric.microsoft.com is accessible');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Connection refused - check firewall/proxy settings');
    }
  }

  // Test 2: Check our backend health
  console.log('\n🏥 Test 2: Backend Health...');
  try {
    const healthResponse = await axios.get('http://localhost:3001/health', { timeout: 5000 });
    console.log('✅ Backend is healthy:', healthResponse.data);
  } catch (error) {
    console.error('❌ Backend health check failed:', error.message);
  }

  // Test 3: Check backend workspace endpoint (should return 401 without token)
  console.log('\n🏢 Test 3: Backend Workspace Endpoint...');
  try {
    const backendResponse = await axios.get('http://localhost:3001/api/workspaces', {
      timeout: 5000,
      validateStatus: () => true
    });
    
    console.log(`Response: ${backendResponse.status} ${backendResponse.statusText}`);
    if (backendResponse.status === 401) {
      console.log('✅ Backend correctly requests authentication');
    } else {
      console.log('⚠️  Backend response:', backendResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Backend workspace endpoint failed:', error.message);
  }

  // Test 4: Environment validation
  console.log('\n⚙️  Test 4: Environment Configuration...');
  
  const requiredEnvVars = ['CLIENT_ID', 'CLIENT_SECRET', 'TENANT_ID', 'FABRIC_API_BASE_URL'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length === 0) {
    console.log('✅ All required environment variables are set');
    
    // Validate Fabric API URL format
    if (process.env.FABRIC_API_BASE_URL.includes('fabric.microsoft.com')) {
      console.log('✅ Fabric API URL looks correct');
    } else {
      console.log('⚠️  Fabric API URL might be incorrect:', process.env.FABRIC_API_BASE_URL);
    }
    
  } else {
    console.log('❌ Missing environment variables:', missingVars.join(', '));
  }
}

// Test 5: Generate sample authentication URL
console.log('\n🔑 Test 5: Authentication URL Generation...');
if (process.env.CLIENT_ID && process.env.TENANT_ID) {
  const authUrl = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&redirect_uri=http://localhost:3000&scope=https://api.fabric.microsoft.com/Item.ReadWrite.All https://api.fabric.microsoft.com/Workspace.ReadWrite.All openid profile email`;
  
  console.log('🔗 Authentication URL (for manual testing):');
  console.log(authUrl);
  console.log('\n📝 To test authentication:');
  console.log('   1. Copy the URL above');
  console.log('   2. Paste it in a browser');
  console.log('   3. Sign in and authorize the application');
  console.log('   4. Check if you get redirected back to localhost:3000');
}

testEndpoints().catch(console.error);