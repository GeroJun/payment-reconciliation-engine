
const crypto = require('crypto');

 //Generate or validate idempotency key
 //Idempotency keys ensure that duplicate requests don't create duplicate transactions
class IdempotencyHandler {
  static generateKey(transactionData) {
    const key = `${transactionData.source_account_id}:${transactionData.destination_account_id}:${transactionData.amount}:${new Date().toISOString().split('T')[0]}`;
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  static validateKey(key) {
    return /^[a-f0-9]{64}$/.test(key);
  }

  static isValidForTransaction(key, transactionData, storedKey) {
    return key === storedKey;
  }
}

module.exports = IdempotencyHandler;
