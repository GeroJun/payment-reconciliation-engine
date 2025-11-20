const express = require('express');
const { Pool } = require('pg');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const logger = require('./utils/logger');
const WebSocketManager = require('./utils/WebSocketManager');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://reconciliation_user:reconciliation_password@localhost:5432/reconciliation_engine',
  max: 20
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Database connection failed', { error: err.message });
  } else {
    logger.info('Database connected successfully');
  }
});

const wsManager = new WebSocketManager(io);

io.on('connection', (socket) => {
  wsManager.initializeConnection(socket);
});

app.locals.wsManager = wsManager;
app.locals.pool = pool;

const routes = require('./api/routes'); 
app.use('/api/v1', routes(pool)); 

app.get('/', (req, res) => {
  res.json({
    service: 'Payment Reconciliation Engine',
    version: '1.0.0',
    status: 'running'
  });
});

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/v1/websocket/stats', (req, res) => {
  res.json(wsManager.getStatistics());
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Payment Reconciliation Engine running on port ${PORT}`);
});

module.exports = server;
