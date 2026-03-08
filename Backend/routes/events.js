const express = require('express');
const router = express.Router();
const { addGlobalClient, addUserClient } = require('../lib/sse');

// GET /api/events/rounds - Global SSE stream
router.get('/rounds', (req, res) => {
  const success = addGlobalClient(res, req);
  if (!success) return; // 429 already sent
});

// GET /api/user/:address/events - User SSE stream
router.get('/user/:address/events', (req, res) => {
  const { address } = req.params;
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  const success = addUserClient(address, res, req);
  if (!success) return; // 429 already sent
});

module.exports = router;
