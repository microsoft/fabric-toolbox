// Simple PowerShell script to help get authentication token
// Run this to get the authentication URL, then check browser dev tools for token

console.log('🔑 FABRIC API AUTHENTICATION HELPER');
console.log('=====================================\n');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const authUrl = `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&redirect_uri=http://localhost:3000&scope=https://api.fabric.microsoft.com/Item.ReadWrite.All https://api.fabric.microsoft.com/Workspace.ReadWrite.All openid profile email`;

console.log('📋 STEP 1: Copy this URL and open in browser:');
console.log('═'.repeat(50));
console.log(authUrl);
console.log('═'.repeat(50));

console.log('\n📋 STEP 2: After signing in, get your access token:');
console.log('   1. Open browser Developer Tools (F12)');
console.log('   2. Go to Network tab');
console.log('   3. Try to load workspaces in the app');
console.log('   4. Find a request to /api/workspaces');
console.log('   5. Look at Request Headers');
console.log('   6. Copy the Authorization: Bearer <token> value');

console.log('\n📋 STEP 3: Test the token:');
console.log('   1. Open: test-fabric-api.js');
console.log('   2. Replace YOUR_ACCESS_TOKEN_HERE with your real token');
console.log('   3. Run: node test-fabric-api.js');

console.log('\n🔍 TROUBLESHOOTING:');
console.log('   • If you get 401: Token expired or invalid scopes');
console.log('   • If you get 403: Token valid but insufficient permissions');
console.log('   • If you get 404: Wrong API endpoint');
console.log('   • If you get network error: Connectivity issue');

console.log('\n⚙️  CURRENT CONFIGURATION:');
console.log(`   • Tenant ID: ${process.env.TENANT_ID}`);
console.log(`   • Client ID: ${process.env.CLIENT_ID}`);
console.log(`   • Fabric API: ${process.env.FABRIC_API_BASE_URL}`);
console.log(`   • Backend: http://localhost:3001`);
console.log(`   • Frontend: http://localhost:3000`);