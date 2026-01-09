// AWS-Integrated Payment Reconciliation Routes
// Demonstrates:
// - Asynchronous processing with SQS
// - Idempotency handling with Redis cache
// - Double-entry ledger for accounting
// - Health checks and monitoring
// - Production-ready error handling

const express = require('express');
const router = express.Router();

const TransactionProcessor = require('../services/transactionProcessor');
const ReconciliationService = require('../services/reconciliationService');
const LedgerManager = require('../services/ledgerManager');
const { validateTransaction, handleErrors } = require('../utils/validation');
const { authMiddleware } = require('../utils/auth');
const logger = require('../utils/logger');

module.exports = function(pool, sqsProducer, idempotencyCache) {
  const transactionProcessor = new TransactionProcessor(pool);
  const reconciliationService = new ReconciliationService(pool);
  const ledgerManager = new LedgerManager(pool);

  // ============================================
  // TRANSACTION ENDPOINTS
  // ============================================

  /**
   * POST /api/v1/transactions
   * 
   * Async transaction processing via AWS SQS
   * Returns 202 ACCEPTED immediately, processes in background
   * 
   * Request body:
   * {
   *   "transaction": { source_account_id, destination_account_id, amount },
   *   "idempotencyKey": "unique-identifier"
   * }
   * 
   * Response: 202 ACCEPTED with polling URL
   * {
   *   "status": "ACCEPTED",
   *   "idempotencyKey": "...",
   *   "messageId": "...",
   *   "pollUrl": "/api/v1/transactions/status/...",
   *   "expiresAt": "2026-01-09T..."
   * }
   */
  router.post('/transactions', authMiddleware, validateTransaction, async (req, res) => {
    try {
      const { transaction, idempotencyKey } = req.body;

      // Step 1: Check Redis cache for duplicate
      // This prevents duplicate charges if the same idempotencyKey is submitted twice
      // (e.g., webhook retry from payment provider)
      const cached = await idempotencyCache.get(idempotencyKey);
      if (cached) {
        logger.info('Returning cached transaction result', { idempotencyKey });
        return res.status(200).json(cached);
      }

      // Step 2: Publish to SQS queue for async processing
      // This decouples the API from the worker, allowing:
      // - API returns in ~50ms regardless of processing time
      // - Workers can scale independently
      // - Guaranteed message delivery with FIFO SQS
      const sqsResult = await sqsProducer.publishTransaction(transaction, idempotencyKey);

      // Step 3: Return immediately with 202 Accepted + polling URL
      // Client can poll GET /api/v1/transactions/status/:idempotencyKey
      res.status(202).json({
        status: 'ACCEPTED',
        idempotencyKey,
        messageId: sqsResult.messageId,
        pollUrl: `/api/v1/transactions/status/${idempotencyKey}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      logger.info('Transaction queued for processing', {
        idempotencyKey,
        messageId: sqsResult.messageId
      });

    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * GET /api/v1/transactions/status/:idempotencyKey
   * 
   * Poll for transaction completion status
   * 
   * Response: 202 PROCESSING or 200 COMPLETED
   */
  router.get('/transactions/status/:idempotencyKey', authMiddleware, async (req, res) => {
    try {
      const { idempotencyKey } = req.params;

      // Step 1: Check Redis cache for completed transaction
      // If worker already finished, result is cached with 24h TTL
      const status = await idempotencyCache.get(idempotencyKey);

      if (status && (status.status === 'SUCCESS' || status.status === 'DUPLICATE')) {
        return res.status(200).json({
          status: 'COMPLETED',
          result: status
        });
      }

      // Step 2: Check database if not in cache
      // Query idempotency_keys table to find transaction
      const result = await pool.query(
        `SELECT id, source_account_id, destination_account_id, amount, status, created_at
         FROM transactions t
         JOIN idempotency_keys ik ON t.id = ik.transaction_id
         WHERE ik.idempotency_key = $1`,
        [idempotencyKey]
      );

      if (result.rows.length > 0) {
        return res.status(200).json({
          status: 'COMPLETED',
          result: result.rows[0]
        });
      }

      // Step 3: Still processing (message still in queue or being processed)
      res.status(202).json({
        status: 'PROCESSING',
        idempotencyKey
      });

    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * POST /api/v1/transactions/:id/refund
   * 
   * Process refund for a transaction
   * Creates reverse ledger entries
   */
  router.post('/transactions/:id/refund', authMiddleware, async (req, res) => {
    try {
      const { amount, reason } = req.body;
      const transactionId = req.params.id;

      // Process refund through transaction processor
      // This creates a new transaction and ledger entries
      const refund = await transactionProcessor.processRefund(
        transactionId,
        amount,
        reason
      );

      res.status(201).json(refund);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  // ============================================
  // ACCOUNT BALANCE & LEDGER ENDPOINTS
  // ============================================

  /**
   * GET /api/v1/accounts/:accountId/balance
   * 
   * Get current account balance
   * Calculated from double-entry ledger
   */
  router.get('/accounts/:accountId/balance', authMiddleware, async (req, res) => {
    try {
      const balance = await ledgerManager.getBalance(req.params.accountId);
      res.json({
        account_id: req.params.accountId,
        balance,
        currency: 'USD',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * GET /api/v1/accounts/:accountId/ledger
   * 
   * Get paginated ledger history for account
   * Shows all debit/credit entries
   */
  router.get('/accounts/:accountId/ledger', authMiddleware, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
      const offset = parseInt(req.query.offset) || 0;

      const history = await ledgerManager.getLedgerHistory(
        req.params.accountId,
        limit,
        offset
      );

      res.json({
        account_id: req.params.accountId,
        entries: history,
        pagination: {
          limit,
          offset,
          hasMore: history.length === limit
        }
      });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * GET /api/v1/accounts/:accountId/audit-trail
   * 
   * Get audit trail of account actions
   * For compliance and debugging
   */
  router.get('/accounts/:accountId/audit-trail', authMiddleware, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const trail = await ledgerManager.getAuditTrail(req.params.accountId, limit);

      res.json({
        account_id: req.params.accountId,
        audit_trail: trail,
        count: trail.length
      });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  // ============================================
  // RECONCILIATION ENDPOINTS
  // ============================================

  /**
   * POST /api/v1/accounts/:accountId/reconcile
   * 
   * Trigger reconciliation for a date range
   * Detects discrepancies between expected and actual balances
   */
  router.post('/accounts/:accountId/reconcile', authMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.body;
      const accountId = req.params.accountId;

      // Validate input
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'startDate and endDate are required'
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start >= end) {
        return res.status(400).json({
          error: 'startDate must be before endDate'
        });
      }

      // Run reconciliation
      const report = await reconciliationService.reconcileAccount(
        accountId,
        start,
        end
      );

      res.status(201).json(report);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * GET /api/v1/accounts/:accountId/reconciliation-history
   * 
   * Get history of reconciliations performed
   */
  router.get('/accounts/:accountId/reconciliation-history', authMiddleware, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 50, 500);
      const history = await reconciliationService.getReconciliationHistory(
        req.params.accountId,
        limit
      );

      res.json({
        account_id: req.params.accountId,
        reconciliation_history: history,
        count: history.length
      });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * GET /api/v1/accounts/:accountId/reconciliation-difference
   * 
   * Get balance difference between expected and actual
   * Used for detecting discrepancies
   */
  router.get('/accounts/:accountId/reconciliation-difference', authMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'startDate and endDate query parameters are required'
        });
      }

      const difference = await ledgerManager.getReconciliationDifference(
        req.params.accountId,
        new Date(startDate),
        new Date(endDate)
      );

      res.json(difference);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * POST /api/v1/transactions/:id/verify-double-entry
   * 
   * Verify transaction has matching debit/credit entries
   * Part of data integrity checks
   */
  router.post('/transactions/:id/verify-double-entry', authMiddleware, async (req, res) => {
    try {
      const verification = await ledgerManager.verifyDoubleEntry(req.params.id);
      res.json(verification);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  // ============================================
  // MONITORING & QUEUE ENDPOINTS
  // ============================================

  /**
   * GET /api/v1/queue/stats
   * 
   * Get AWS SQS queue statistics
   * Shows queue depth and message visibility
   */
  router.get('/queue/stats', authMiddleware, async (req, res) => {
    try {
      const stats = await sqsProducer.getQueueAttributes();
      res.json({
        ...stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  /**
   * GET /api/v1/cache/stats
   * 
   * Get Redis cache statistics
   * Shows cache health and memory usage
   */
  router.get('/cache/stats', authMiddleware, async (req, res) => {
    try {
      const stats = await idempotencyCache.getStats();
      res.json({
        ...stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  // ============================================
  // HEALTH CHECK ENDPOINTS
  // ============================================

  /**
   * GET /api/v1/health
   * 
   * Liveness probe for Kubernetes
   * Simple health check (always responds if app is running)
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    });
  });

  /**
   * GET /api/v1/ready
   * 
   * Readiness probe for Kubernetes
   * Verifies all dependencies (database, cache, queue) are healthy
   * 
   * Only returns 200 when safe to receive traffic
   */
  router.get('/ready', async (req, res) => {
    try {
      // Check database connectivity
      await pool.query('SELECT 1');

      // Check cache (Redis) connectivity
      const cacheOk = await idempotencyCache.ping();

      // Check queue (SQS) connectivity
      const queueOk = await sqsProducer.getQueueAttributes();

      // If any dependency is down, return 503
      if (!cacheOk || !queueOk) {
        return res.status(503).json({
          status: 'NOT_READY',
          components: {
            database: 'ready',
            cache: cacheOk ? 'ready' : 'not_ready',
            queue: queueOk ? 'ready' : 'not_ready'
          }
        });
      }

      // All systems go
      res.json({
        status: 'READY',
        components: {
          database: 'ready',
          cache: 'ready',
          queue: 'ready'
        }
      });
    } catch (error) {
      res.status(503).json({
        status: 'NOT_READY',
        error: error.message
      });
    }
  });

  return router;
};
