require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 10000;

// ─── Middleware ────────────────────────────────────────────────────────────

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.set('trust proxy', 1);

// Default rate limit: 60 req/min/IP
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// Strict rate limit: 5 req/min/IP (user-specific endpoints)
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

app.use('/api', defaultLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────

const statsRouter = require('./routes/stats');
const roundsRouter = require('./routes/rounds');
const userRouter = require('./routes/user');
const treasuryRouter = require('./routes/treasury');
const leaderboardRouter = require('./routes/leaderboard');
const stakingRouter = require('./routes/staking');
const automineRouter = require('./routes/automine');
const eventsRouter = require('./routes/events');

app.use('/api/stats', statsRouter);
app.use('/api/price', statsRouter);
// /api/rounds (list) must be before /api/round/:id to avoid conflict
app.use('/api/rounds', roundsRouter);
app.use('/api/round', roundsRouter);
app.use('/api/user', strictLimiter, userRouter);
// User SSE stream: /api/user/:address/events — handled via eventsRouter mounted at /api
app.use('/api', eventsRouter);
app.use('/api/treasury', treasuryRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/staking', strictLimiter, stakingRouter);
app.use('/api/automine', strictLimiter, automineRouter);
app.use('/api/events', eventsRouter);

// ─── Health Check ─────────────────────────────────────────────────────────

app.get('/health', async (req, res) => {
  const mongoState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    mongo: mongoState[mongoose.connection.readyState] || 'unknown',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ─── Database ─────────────────────────────────────────────────────────────

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[DB] MONGODB_URI not set — running without database');
    return;
  }
  try {
    await mongoose.connect(uri);
    console.log('[DB] Connected to MongoDB');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    // Retry after 5s
    setTimeout(connectDB, 5000);
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[DB] Disconnected — retrying in 5s');
  setTimeout(connectDB, 5000);
});

// ─── Start ────────────────────────────────────────────────────────────────

async function start() {
  await connectDB();

  // Start blockchain event indexer (only when RPC_URL is set)
  if (process.env.RPC_URL) {
    try {
      const { startIndexer } = require('./lib/indexer');
      await startIndexer();
    } catch (err) {
      console.error('[Indexer] Failed to start:', err.message);
    }
  } else {
    console.warn('[Indexer] RPC_URL not set — blockchain indexer disabled');
  }

  app.listen(PORT, () => {
    console.log(`[Server] BNBEAN Protocol API running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
