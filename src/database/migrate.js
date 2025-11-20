const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://reconciliation_user:reconciliation_password@localhost:5432/reconciliation_engine'
});
const migrations = [
  {
    name: '001_init_schema',
    sql: `CREATE TABLE IF NOT EXISTS transactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_account_id UUID NOT NULL, destination_account_id UUID NOT NULL, amount DECIMAL(15, 2) NOT NULL, status VARCHAR(50) DEFAULT 'PENDING', created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS ledger_entries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id UUID NOT NULL REFERENCES transactions(id), account_id UUID NOT NULL, amount DECIMAL(15, 2) NOT NULL, entry_type VARCHAR(50) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS idempotency_keys (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key VARCHAR(255) NOT NULL UNIQUE, transaction_id UUID NOT NULL REFERENCES transactions(id), created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS reconciliation_reports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL, period_start TIMESTAMP NOT NULL, period_end TIMESTAMP NOT NULL, balanced BOOLEAN DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_transactions_source_account ON transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);`
  },
  {
    name: '002_add_constraints',
    sql: `BEGIN;
ALTER TABLE IF EXISTS transactions ADD CONSTRAINT check_amount_positive CHECK (amount > 0);
ALTER TABLE IF EXISTS ledger_entries ADD CONSTRAINT check_valid_entry_type CHECK (entry_type IN ('DEBIT', 'CREDIT'));
COMMIT;`
  }
];
async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Starting database migrations...');
    for (const migration of migrations) {
      console.log(`Running migration: ${migration.name}`);
      await client.query(migration.sql);
      console.log(` Migration complete: ${migration.name}`);
    }
    console.log('\n All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
runMigrations();
