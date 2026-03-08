// SSE connection manager
// Manages global (round) and per-user event streams

const globalClients = new Set();
const userClients = new Map(); // address -> Set<res>

const MAX_SSE_PER_IP = 10;
const MAX_SSE_TOTAL = 1000;
const HEARTBEAT_INTERVAL = 30000;

let totalConnections = 0;
const ipConnections = new Map();

function setupSSE(res, type = 'global') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write('\n');

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: {}\n\n`);
  }, HEARTBEAT_INTERVAL);

  res.on('close', () => {
    clearInterval(heartbeat);
  });

  return heartbeat;
}

function addGlobalClient(res, req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const count = ipConnections.get(ip) || 0;
  if (count >= MAX_SSE_PER_IP || totalConnections >= MAX_SSE_TOTAL) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return false;
  }

  const heartbeat = setupSSE(res);
  globalClients.add(res);
  totalConnections++;
  ipConnections.set(ip, count + 1);

  res.on('close', () => {
    globalClients.delete(res);
    totalConnections--;
    const c = ipConnections.get(ip) || 1;
    if (c <= 1) ipConnections.delete(ip);
    else ipConnections.set(ip, c - 1);
    clearInterval(heartbeat);
  });

  return true;
}

function addUserClient(address, res, req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const count = ipConnections.get(ip) || 0;
  if (count >= MAX_SSE_PER_IP || totalConnections >= MAX_SSE_TOTAL) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return false;
  }

  const heartbeat = setupSSE(res, 'user');
  const addr = address.toLowerCase();

  if (!userClients.has(addr)) {
    userClients.set(addr, new Set());
  }
  userClients.get(addr).add(res);
  totalConnections++;
  ipConnections.set(ip, count + 1);

  res.on('close', () => {
    const clients = userClients.get(addr);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) userClients.delete(addr);
    }
    totalConnections--;
    const c = ipConnections.get(ip) || 1;
    if (c <= 1) ipConnections.delete(ip);
    else ipConnections.set(ip, c - 1);
    clearInterval(heartbeat);
  });

  return true;
}

function emitGlobal(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of globalClients) {
    client.write(msg);
  }
}

function emitToUser(address, event, data) {
  const addr = address.toLowerCase();
  const clients = userClients.get(addr);
  if (!clients) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(msg);
  }
}

function getStats() {
  return {
    globalClients: globalClients.size,
    userClients: userClients.size,
    totalConnections,
  };
}

module.exports = {
  addGlobalClient,
  addUserClient,
  emitGlobal,
  emitToUser,
  getStats,
};
