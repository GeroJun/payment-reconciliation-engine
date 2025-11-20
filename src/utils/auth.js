
const logger = require('./logger');

//Authentication middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  // In production, verify JWT or validate against auth service
  if (token === 'demo-token-for-testing') {
    next();
  } else {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { authMiddleware };
