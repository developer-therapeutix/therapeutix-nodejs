const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');

const router = express.Router();

// Middleware to check JWT and set req.user
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check required role(s)
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access requires one of: ${roles.join(', ')}` });
    }
    next();
  };
};

module.exports = {
  authenticate,
  requireRole
};
