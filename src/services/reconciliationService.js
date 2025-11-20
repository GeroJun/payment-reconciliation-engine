
const Pool = require('pg').Pool;
const logger = require('../utils/logger');

class ReconciliationService {
  constructor(pool) {
    this.pool = pool;
  }

  async reconcileAccount(accountId, startDate, endDate) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Fetch all transactions in period
      const transactionsResult = await client.query(
        `SELECT * FROM transactions 
         WHERE account_id = $1 
         AND created_at BETWEEN $2 AND $3
         ORDER BY created_at ASC`,
        [accountId, startDate, endDate]
      );

      // Calculate ledger balance at period start
      const ledgerBalanceResult = await client.query(
        `SELECT SUM(amount) as total_balance FROM ledger_entries 
         WHERE account_id = $1 AND created_at < $2`,
        [accountId, startDate]
      );

      const transactions = transactionsResult.rows;
      const expectedBalance = ledgerBalanceResult.rows[0].total_balance || 0;

      // Reconcile each transaction
      const discrepancies = [];
      let processedBalance = expectedBalance;

      for (const txn of transactions) {
        const ledgerResult = await client.query(
          `SELECT * FROM ledger_entries 
           WHERE transaction_id = $1`,
          [txn.id]
        );

        if (ledgerResult.rows.length === 0) {
          discrepancies.push({
            type: 'MISSING_LEDGER_ENTRY',
            transaction_id: txn.id,
            amount: txn.amount,
            severity: 'HIGH'
          });
        } else {
          const ledgerEntry = ledgerResult.rows[0];
          if (ledgerEntry.amount !== txn.amount) {
            discrepancies.push({
              type: 'AMOUNT_MISMATCH',
              transaction_id: txn.id,
              expected: txn.amount,
              actual: ledgerEntry.amount,
              severity: 'CRITICAL'
            });
          }
        }

        processedBalance += txn.amount;
      }

      // Calculate final ledger balance
      const finalLedgerResult = await client.query(
        `SELECT SUM(amount) as total_balance FROM ledger_entries 
         WHERE account_id = $1 AND created_at <= $2`,
        [accountId, endDate]
      );

      const actualBalance = finalLedgerResult.rows[0].total_balance || 0;

      // Store reconciliation report
      const reportId = await this.storeReconciliationReport(client, {
        account_id: accountId,
        period_start: startDate,
        period_end: endDate,
        transaction_count: transactions.length,
        discrepancy_count: discrepancies.length,
        expected_balance: expectedBalance,
        actual_balance: actualBalance,
        balanced: expectedBalance === actualBalance,
        discrepancies: discrepancies
      });

      await client.query('COMMIT');

      return {
        report_id: reportId,
        account_id: accountId,
        period: { start: startDate, end: endDate },
        transaction_count: transactions.length,
        discrepancy_count: discrepancies.length,
        balanced: expectedBalance === actualBalance,
        expected_balance: expectedBalance,
        actual_balance: actualBalance,
        discrepancies: discrepancies
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Reconciliation error', { accountId, error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  //Store reconciliation report in database
  async storeReconciliationReport(client, report) {
    const result = await client.query(
      `INSERT INTO reconciliation_reports 
       (account_id, period_start, period_end, transaction_count, discrepancy_count, balanced, report_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id`,
      [
        report.account_id,
        report.period_start,
        report.period_end,
        report.transaction_count,
        report.discrepancy_count,
        report.balanced,
        JSON.stringify(report)
      ]
    );

    return result.rows[0].id;
  }

  //Get reconciliation history for account
  async getReconciliationHistory(accountId, limit = 50) {
    const result = await this.pool.query(
      `SELECT id, account_id, period_start, period_end, transaction_count, 
              discrepancy_count, balanced, created_at
       FROM reconciliation_reports
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [accountId, limit]
    );

    return result.rows;
  }
}

module.exports = ReconciliationService;
