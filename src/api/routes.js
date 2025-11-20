
const express = require('express');
const router = express.Router();
const TransactionProcessor = require('../services/transactionProcessor');
const ReconciliationService = require('../services/reconciliationService');
const LedgerManager = require('../services/ledgerManager');
const { validateTransaction, handleErrors } = require('../utils/validation');
const { authMiddleware } = require('../utils/auth');
const logger = require('../utils/logger');

module.exports = function(pool) {
  const transactionProcessor = new TransactionProcessor(pool);
  const reconciliationService = new ReconciliationService(pool);
  const ledgerManager = new LedgerManager(pool);

  //POST /api/v1/transactions
  router.post('/transactions', authMiddleware, validateTransaction, async (req, res) => {
    try {
      const { transaction, idempotencyKey } = req.body;

      const result = await transactionProcessor.processTransaction(
        transaction,
        idempotencyKey
      );

      res.status(result.status === 'DUPLICATE' ? 200 : 201).json(result);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //POST /api/v1/transactions/:id/refund
  router.post('/transactions/:id/refund', authMiddleware, async (req, res) => {
    try {
      const { amount, reason } = req.body;
      const transactionId = req.params.id;

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

  //GET /api/v1/accounts/:accountId/balance
  router.get('/accounts/:accountId/balance', authMiddleware, async (req, res) => {
    try {
      const balance = await ledgerManager.getBalance(req.params.accountId);
      res.json({ account_id: req.params.accountId, balance });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //GET /api/v1/accounts/:accountId/ledger
  router.get('/accounts/:accountId/ledger', authMiddleware, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const history = await ledgerManager.getLedgerHistory(
        req.params.accountId,
        limit,
        offset
      );

      res.json({ account_id: req.params.accountId, entries: history });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //GET /api/v1/accounts/:accountId/audit-trail
  router.get('/accounts/:accountId/audit-trail', authMiddleware, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const trail = await ledgerManager.getAuditTrail(req.params.accountId, limit);
      res.json({ account_id: req.params.accountId, audit_trail: trail });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //POST /api/v1/accounts/:accountId/reconcile
  router.post('/accounts/:accountId/reconcile', authMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.body;

      const report = await reconciliationService.reconcileAccount(
        req.params.accountId,
        new Date(startDate),
        new Date(endDate)
      );

      res.status(201).json(report);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //GET /api/v1/accounts/:accountId/reconciliation-history
  router.get('/accounts/:accountId/reconciliation-history', authMiddleware, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const history = await reconciliationService.getReconciliationHistory(
        req.params.accountId,
        limit
      );

      res.json({ account_id: req.params.accountId, reconciliation_history: history });
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //GET /api/v1/accounts/:accountId/reconciliation-difference
  router.get('/accounts/:accountId/reconciliation-difference', authMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

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

  //POST /api/v1/transactions/:id/verify-double-entry
  router.post('/transactions/:id/verify-double-entry', authMiddleware, async (req, res) => {
    try {
      const verification = await ledgerManager.verifyDoubleEntry(req.params.id);
      res.json(verification);
    } catch (error) {
      handleErrors(error, res);
    }
  });

  //GET /api/v1/health
  router.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  return router;
};
