
const logger = require('./logger');

//Validate transaction request
const validateTransaction = (req, res, next) => {
  const { transaction, idempotencyKey } = req.body;

  const errors = [];

  if (!transaction) {
    errors.push('Transaction object is required');
  } else {
    if (!transaction.source_account_id) errors.push('source_account_id is required');
    if (!transaction.destination_account_id) errors.push('destination_account_id is required');
    if (!transaction.amount || transaction.amount <= 0) errors.push('Valid amount is required');
  }

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    errors.push('idempotencyKey is required and must be a string');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

//Handle errors consistently
const handleErrors = (error, res) => {
  logger.error('API Error', { error: error.message });

  if (error.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry' });
  }

  if (error.message.includes('not found')) {
    return res.status(404).json({ error: error.message });
  }

  if (error.message.includes('Invalid') || error.message.includes('Missing')) {
    return res.status(400).json({ error: error.message });
  }

  res.status(500).json({ error: 'Internal server error' });
};

module.exports = { validateTransaction, handleErrors };
