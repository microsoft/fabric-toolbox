const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

/**
 * Debug route to test Fabric API calls
 */
router.get('/fabric-test', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 Debug: Testing Fabric API call...');
    console.log('🔑 User token info:', {
      userId: req.user.id,
      email: req.user.email,
      scopes: req.user.scopes,
      tokenLength: req.accessToken.length
    });

    const fabricUrl = `${process.env.FABRIC_API_BASE_URL}/workspaces`;
    console.log('🌐 Making request to:', fabricUrl);

    const response = await axios.get(fabricUrl, {
      headers: {
        'Authorization': `Bearer ${req.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    console.log('✅ Fabric API Success:', response.status);
    
    res.json({
      success: true,
      status: response.status,
      workspaceCount: response.data.value?.length || 0,
      firstWorkspace: response.data.value?.[0] || null,
      userInfo: {
        id: req.user.id,
        email: req.user.email,
        scopes: req.user.scopes
      }
    });

  } catch (error) {
    console.error('❌ Fabric API Error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      data: error.response?.data
    });

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      userInfo: {
        id: req.user?.id,
        email: req.user?.email,
        scopes: req.user?.scopes
      }
    });
  }
});

/**
 * Debug route to check token decode
 */
router.get('/token-info', authenticateToken, (req, res) => {
  try {
    const tokenParts = req.accessToken.split('.');
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    res.json({
      tokenInfo: {
        aud: payload.aud,
        iss: payload.iss,
        exp: new Date(payload.exp * 1000).toISOString(),
        scopes: payload.scp,
        appId: payload.appid,
        tenant: payload.tid
      },
      userInfo: req.user,
      tokenLength: req.accessToken.length
    });
  } catch (error) {
    res.status(400).json({
      error: 'Could not decode token',
      message: error.message
    });
  }
});

module.exports = router;