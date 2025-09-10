const jwt = require('jsonwebtoken');
// Switched from Mongoose User model to DynamoDB user repository
const userRepo = require('../../models/userRepo');

// Middleware to check JWT and set req.user
const authenticate = async (req, res, next) => {

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error_code: 'NO_TOKEN_PROVIDED', error: 'No token provided' });
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userRepo.getUserById(decoded.id);
    if (!user) return res.status(401).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
    if (user.enabled === false) return res.status(403).json({ error_code: 'USER_DISABLED', error: 'User is disabled' });
    req.user = user;
    next();
  } catch (err) {
    console.log(err);
    res.status(401).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });
  }
};

// Middleware to check required role(s)
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error_code: 'ACCESS_DENIED', error: `Access requires one of: ${roles.join(', ')}` });
    }
    next();
  };
};



module.exports = {
  authenticate,
  requireRole,
};
