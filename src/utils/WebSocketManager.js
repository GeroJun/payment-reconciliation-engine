const logger = require('./logger');

 // WebSocket manager for real-time reconciliation updates
 // Handles connections, broadcasting, and cleanup
class WebSocketManager {
  constructor(io) {
    this.io = io;
    this.activeConnections = new Map();      // Track active connections
    this.activeReconciliations = new Map();  // Track reconciliation progress
    this.connectionTimeout = 5 * 60 * 1000;  // 5 minutes
  }

  initializeConnection(socket) {
    logger.info('WebSocket client connected', { socketId: socket.id });
    this.activeConnections.set(socket.id, {
      socketId: socket.id,
      connectedAt: new Date(),
      rooms: new Set(),
      lastActivity: new Date()
    });

    socket.on('subscribe_reconciliation', (accountId) => {
      this.handleSubscribe(socket, accountId);
    });

    socket.on('unsubscribe_reconciliation', (accountId) => {
      this.handleUnsubscribe(socket, accountId);
    });

    socket.on('ping', () => {
      socket.emit('pong');
      const connection = this.activeConnections.get(socket.id);
      if (connection) {
        connection.lastActivity = new Date();
      }
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });

    socket.on('error', (error) => {
      logger.error('WebSocket error', { socketId: socket.id, error: error.message });
    });
  }

  handleSubscribe(socket, accountId) {
    if (!accountId) {
      socket.emit('error', { message: 'Invalid accountId' });
      return;
    }

    const roomName = `reconciliation:${accountId}`;
    socket.join(roomName);

    const connection = this.activeConnections.get(socket.id);
    if (connection) {
      connection.rooms.add(roomName);
    }

    logger.info('Client subscribed to reconciliation', {
      socketId: socket.id,
      accountId,
      room: roomName
    });

    socket.emit('subscription_confirmed', {
      accountId,
      room: roomName,
      timestamp: new Date().toISOString()
    });
  }

  handleUnsubscribe(socket, accountId) {
    const roomName = `reconciliation:${accountId}`;
    socket.leave(roomName);

    const connection = this.activeConnections.get(socket.id);
    if (connection) {
      connection.rooms.delete(roomName);
    }

    logger.info('Client unsubscribed from reconciliation', {
      socketId: socket.id,
      accountId
    });

    socket.emit('unsubscription_confirmed', {
      accountId,
      timestamp: new Date().toISOString()
    });
  }

  broadcastReconciliationProgress(accountId, progress) {
    const roomName = `reconciliation:${accountId}`;

    const message = {
      type: 'reconciliation_progress',
      accountId,
      timestamp: new Date().toISOString(),
      data: {
        processed: progress.processed || 0,
        total: progress.total || 0,
        percentage: progress.percentage || 0,
        status: progress.status || 'processing',
        currentTransaction: progress.currentTransaction,
        ...progress
      }
    };

    this.io.to(roomName).emit('reconciliation_progress', message);

    logger.info('Reconciliation progress broadcasted', {
      accountId,
      percentage: progress.percentage
    });
  }

  broadcastReconciliationComplete(accountId, report) {
    const roomName = `reconciliation:${accountId}`;

    const message = {
      type: 'reconciliation_complete',
      accountId,
      timestamp: new Date().toISOString(),
      data: {
        reportId: report.report_id,
        balanced: report.balanced,
        discrepancyCount: report.discrepancy_count,
        transactionCount: report.transaction_count,
        report: report
      }
    };

    this.io.to(roomName).emit('reconciliation_complete', message);

    logger.info('Reconciliation completion broadcasted', {
      accountId,
      balanced: report.balanced
    });

    this.activeReconciliations.delete(accountId);
  }

  broadcastReconciliationError(accountId, error) {
    const roomName = `reconciliation:${accountId}`;

    const message = {
      type: 'reconciliation_error',
      accountId,
      timestamp: new Date().toISOString(),
      data: {
        error: error.message,
        code: error.code,
        severity: error.severity || 'ERROR'
      }
    };

    this.io.to(roomName).emit('reconciliation_error', message);
    logger.error('Reconciliation error broadcasted', {
      accountId,
      error: error.message
    });

    this.activeReconciliations.delete(accountId);
  }

  broadcastTransactionUpdate(accountId, transaction) {
    const roomName = `account:${accountId}`;

    const message = {
      type: 'transaction_update',
      accountId,
      timestamp: new Date().toISOString(),
      data: {
        transactionId: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        ...transaction
      }
    };

    this.io.to(roomName).emit('transaction_update', message);
  }

  handleDisconnect(socket) {
    const connection = this.activeConnections.get(socket.id);

    if (connection) {
      logger.info('WebSocket client disconnected', {
        socketId: socket.id,
        connectedDuration: new Date() - connection.connectedAt,
        roomsSubscribed: connection.rooms.size
      });

      this.activeConnections.delete(socket.id);
    }
  }

  getActiveConnectionCount() {
    return this.activeConnections.size;
  }

  getConnectionsInRoom(roomName) {
    return this.io.sockets.adapter.rooms.get(roomName)?.size || 0;
  }

  broadcastSystemMessage(message, data = {}) {
    this.io.emit('system_message', {
      type: 'system',
      timestamp: new Date().toISOString(),
      message,
      data
    });
  }
  
  getStatistics() {
    return {
      activeConnections: this.activeConnections.size,
      activeReconciliations: this.activeReconciliations.size,
      connections: Array.from(this.activeConnections.values()).map(conn => ({
        socketId: conn.socketId,
        connectedDuration: new Date() - conn.connectedAt,
        rooms: Array.from(conn.rooms)
      }))
    };
  }

  cleanupStaleConnections() {
    const now = new Date();
    const staleConnections = [];

    for (const [socketId, connection] of this.activeConnections.entries()) {
      const inactivityDuration = now - connection.lastActivity;
      if (inactivityDuration > this.connectionTimeout) {
        staleConnections.push(socketId);
        this.io.sockets.sockets.get(socketId)?.disconnect();
      }
    }

    if (staleConnections.length > 0) {
      logger.info('Cleaned up stale connections', {
        count: staleConnections.length,
        socketIds: staleConnections
      });
    }
  }
}

module.exports = WebSocketManager;
