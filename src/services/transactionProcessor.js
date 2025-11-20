
const logger = require('../utils/logger');

class TransactionProcessor {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Process incoming transaction with idempotency guarantee
   * @param {Object} transaction - Transaction data
   * @param {string} idempotencyKey - Unique identifier for idempotency
   * @returns {Object} Processed transaction
   */
  async processTransaction(transaction, idempotencyKey) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check if transaction was already processed
      const existingResult = await client.query(
        `SELECT id, transaction_id FROM idempotency_keys 
         WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existingResult.rows.length > 0) {
        logger.info('Duplicate transaction detected', { idempotencyKey });
        const txnResult = await client.query(
          `SELECT * FROM transactions WHERE id = $1`,
          [existingResult.rows[0].transaction_id]
        );
        await client.query('COMMIT');
        return { status: 'DUPLICATE', transaction: txnResult.rows[0] };
      }

      // Validate transaction
      this.validateTransaction(transaction);

      // Insert transaction
      const txnResult = await client.query(
        `INSERT INTO transactions 
         (source_account_id, destination_account_id, amount, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING *`,
        [
          transaction.source_account_id,
          transaction.destination_account_id,
          transaction.amount,
          'PENDING',
          JSON.stringify(transaction.metadata || {})
        ]
      );

      const txnId = txnResult.rows[0].id;

      // Record idempotency key
      await client.query(
        `INSERT INTO idempotency_keys (idempotency_key, transaction_id, created_at)
         VALUES ($1, $2, NOW())`,
        [idempotencyKey, txnId]
      );

      // Create double-entry ledger entries
      await this.createLedgerEntries(client, txnId, transaction);

      // Update transaction status
      await client.query(
        `UPDATE transactions SET status = $1 WHERE id = $2`,
        ['COMPLETED', txnId]
      );

      await client.query('COMMIT');

      logger.info('Transaction processed', { transactionId: txnId, idempotencyKey });

      return {
        status: 'SUCCESS',
        transaction_id: txnId,
        transaction: txnResult.rows[0]
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction processing error', { 
        idempotencyKey, 
        error: error.message 
      });
      throw error;
    } finally {
      client.release();
    }
  }

  //Handle partial payment scenario
  async processPartialPayment(transactionId, paidAmount, client) {
    const result = await client.query(
      `UPDATE transactions 
       SET amount_remaining = amount_remaining - $1, status = 
       CASE WHEN (amount_remaining - $1) = 0 THEN 'COMPLETED' ELSE 'PARTIAL' END
       WHERE id = $2
       RETURNING *`,
      [paidAmount, transactionId]
    );

    return result.rows[0];
  }

  //Handle refund scenario
  async processRefund(transactionId, refundAmount, reason) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get original transaction
      const txnResult = await client.query(
        `SELECT * FROM transactions WHERE id = $1`,
        [transactionId]
      );

      if (txnResult.rows.length === 0) {
        throw new Error('Transaction not found');
      }

      const originalTxn = txnResult.rows[0];

      // Create refund transaction
      const refundResult = await client.query(
        `INSERT INTO transactions 
         (source_account_id, destination_account_id, amount, status, type, parent_transaction_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [
          originalTxn.destination_account_id,
          originalTxn.source_account_id,
          refundAmount,
          'COMPLETED',
          'REFUND',
          transactionId,
          JSON.stringify({ reason })
        ]
      );

      // Create ledger entries for refund
      await this.createLedgerEntries(client, refundResult.rows[0].id, {
        source_account_id: originalTxn.destination_account_id,
        destination_account_id: originalTxn.source_account_id,
        amount: refundAmount
      });

      // Update original transaction status
      await client.query(
        `UPDATE transactions SET status = $1 WHERE id = $2`,
        ['REFUNDED', transactionId]
      );

      await client.query('COMMIT');

      logger.info('Refund processed', { originalTransactionId: transactionId, refundAmount });

      return refundResult.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Refund processing error', { transactionId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  //Validate transaction integrity
  validateTransaction(transaction) {
    if (!transaction.source_account_id || !transaction.destination_account_id) {
      throw new Error('Missing account IDs');
    }

    if (transaction.source_account_id === transaction.destination_account_id) {
      throw new Error('Cannot transfer to same account');
    }

    if (typeof transaction.amount !== 'number' || transaction.amount <= 0) {
      throw new Error('Invalid amount');
    }
  }

  //Create double-entry ledger entries
  async createLedgerEntries(client, transactionId, transaction) {
    // Debit from source account
    await client.query(
      `INSERT INTO ledger_entries 
       (transaction_id, account_id, amount, entry_type, account_side, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [transactionId, transaction.source_account_id, -transaction.amount, 'DEBIT', 'SOURCE']
    );

    // Credit to destination account
    await client.query(
      `INSERT INTO ledger_entries 
       (transaction_id, account_id, amount, entry_type, account_side, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [transactionId, transaction.destination_account_id, transaction.amount, 'CREDIT', 'DESTINATION']
    );
  }
}

module.exports = TransactionProcessor;
