// test-api.js
// Save this file in your backend folder
// Run this with: node test-api.js

const baseURL = 'http://localhost:5000';
const http = require('http');
const https = require('https');

// Test data
const testUser = {
  username: 'testuser123',
  password: 'TestPass123!',
  firstName: 'Test',
  lastName: 'User'
};

let accessToken = '';
let refreshToken = '';

// Helper function to make requests (Node.js native http module)
function makeRequest(endpoint, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${baseURL}${endpoint}`);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsedData });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject({ error: error.message });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Test functions
async function testServerRunning() {
  console.log('\n🧪 Test 1: Server Running');
  
  return new Promise((resolve, reject) => {
    http.get(baseURL, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log('✅ Response:', data);
        resolve();
      });
    }).on('error', (error) => {
      console.log('❌ Error:', error.message);
      reject(error);
    });
  });
}

async function testRegister() {
  console.log('\n🧪 Test 2: Register New User');
  const result = await makeRequest('/api/auth/register', 'POST', testUser);
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 201) {
    console.log('✅ Registration successful!');
  } else if (result.status === 409) {
    console.log('⚠️  User already exists (this is okay for testing)');
  } else {
    console.log('❌ Registration failed');
  }
}

async function testLogin() {
  console.log('\n🧪 Test 3: Login');
  const result = await makeRequest('/api/auth/login', 'POST', {
    username: testUser.username,
    password: testUser.password
  });
  
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    accessToken = result.data.accessToken;
    refreshToken = result.data.refreshToken;
    console.log('✅ Login successful!');
    console.log('📝 Access Token saved');
    console.log('📝 Refresh Token saved');
  } else {
    console.log('❌ Login failed');
  }
}

async function testProtectedRoute() {
  console.log('\n🧪 Test 4: Access Protected Route');
  
  if (!accessToken) {
    console.log('❌ No access token available. Login first.');
    return;
  }
  
  const result = await makeRequest('/api/protected/profile', 'GET', null, accessToken);
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ Protected route accessed successfully!');
  } else {
    console.log('❌ Failed to access protected route');
  }
}

async function testRefreshToken() {
  console.log('\n🧪 Test 5: Refresh Access Token');
  
  if (!refreshToken) {
    console.log('❌ No refresh token available. Login first.');
    return;
  }
  
  const result = await makeRequest('/api/auth/refresh', 'POST', { refreshToken });
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    accessToken = result.data.accessToken;
    console.log('✅ Token refreshed successfully!');
    console.log('📝 New access token saved');
  } else {
    console.log('❌ Token refresh failed');
  }
}

async function testLogout() {
  console.log('\n🧪 Test 6: Logout');
  
  if (!refreshToken) {
    console.log('❌ No refresh token available. Login first.');
    return;
  }
  
  const result = await makeRequest('/api/auth/logout', 'POST', { refreshToken });
  console.log('Status:', result.status);
  console.log('Response:', JSON.stringify(result.data, null, 2));
  
  if (result.status === 200) {
    console.log('✅ Logout successful!');
  } else {
    console.log('❌ Logout failed');
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting API Tests...');
  console.log('====================================');
  
  await testServerRunning();
  await testRegister();
  await testLogin();
  await testProtectedRoute();
  await testRefreshToken();
  await testProtectedRoute(); // Test with new token
  await testLogout();
  
  console.log('\n====================================');
  console.log('✨ All tests completed!');
}

// Run the tests
runAllTests().catch(console.error);