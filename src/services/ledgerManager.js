
const logger = require('../utils/logger');

class LedgerManager {
  constructor(pool) {
    this.pool = pool;
  }

  //Get current balance for account
  async getBalance(accountId) {
    const result = await this.pool.query(
      `SELECT SUM(amount) as balance FROM ledger_entries 
       WHERE account_id = $1`,
      [accountId]
    );

    return result.rows[0].balance || 0;
  }

   //Get detailed ledger history for account
  async getLedgerHistory(accountId, limit = 100, offset = 0) {
    const result = await this.pool.query(
      `SELECT le.*, t.source_account_id, t.destination_account_id, t.status, t.metadata
       FROM ledger_entries le
       JOIN transactions t ON le.transaction_id = t.id
       WHERE le.account_id = $1
       ORDER BY le.created_at DESC
       LIMIT $2 OFFSET $3`,
      [accountId, limit, offset]
    );

    return result.rows;
  }

  //Verify double-entry integrity for transaction
  async verifyDoubleEntry(transactionId) {
    const result = await this.pool.query(
      `SELECT entry_type, SUM(amount) as total
       FROM ledger_entries
       WHERE transaction_id = $1
       GROUP BY entry_type`,
      [transactionId]
    );

    const entries = result.rows;

    if (entries.length !== 2) {
      return { valid: false, reason: 'Not exactly 2 entry types' };
    }

    const debits = entries.find(e => e.entry_type === 'DEBIT')?.total || 0;
    const credits = entries.find(e => e.entry_type === 'CREDIT')?.total || 0;

    const balanced = Math.abs(debits + credits) < 0.01; // Allow for floating point errors

    return {
      valid: balanced,
      debits: Math.abs(debits),
      credits: credits,
      balanced: balanced
    };
  }

  //Calculate account reconciliation difference
  async getReconciliationDifference(accountId, startDate, endDate) {
    const result = await this.pool.query(
      `SELECT 
        (SELECT SUM(amount) FROM ledger_entries 
         WHERE account_id = $1 AND created_at BETWEEN $2 AND $3) as ledger_balance,
        (SELECT SUM(CASE WHEN source_account_id = $1 THEN -amount ELSE amount END)
         FROM transactions 
         WHERE (source_account_id = $1 OR destination_account_id = $1)
         AND created_at BETWEEN $2 AND $3) as transaction_balance`,
      [accountId, startDate, endDate]
    );

    const row = result.rows[0];

    return {
      ledger_balance: row.ledger_balance || 0,
      transaction_balance: row.transaction_balance || 0,
      difference: Math.abs((row.ledger_balance || 0) - (row.transaction_balance || 0))
    };
  }

  //Generate audit trail for account
  async getAuditTrail(accountId, limit = 50) {
    const result = await this.pool.query(
      `SELECT 
        le.id, le.transaction_id, le.amount, le.entry_type,
        t.created_at, t.source_account_id, t.destination_account_id,
        t.status, t.type
       FROM ledger_entries le
       JOIN transactions t ON le.transaction_id = t.id
       WHERE le.account_id = $1
       ORDER BY le.created_at DESC
       LIMIT $2`,
      [accountId, limit]
    );

    return result.rows;
  }
}

module.exports = LedgerManager;
