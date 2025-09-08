const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { authenticate } = require('./helper');

const router = express.Router();
// Check if email exists (async validation)
router.get('/check-email/:email', async (req, res) => {
  const { email } = req.params;
  const user = await User.findOne({ email });
  if (user) return res.status(400).json({ error_code: 'EMAIL_CLAIMED', error: 'Email is already claimed' });
  if (!user) return res.status(200).json({ error_code: 'EMAIL_AVAILABLE', error: 'Email is available' });
  // res.json({ exists: !!user });
});

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error_code: 'MISSING_CREDENTIALS', error: 'Email and password required' });
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error_code: 'EMAIL_EXISTS', error: 'Email already exists' });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
  await user.save();

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = require('crypto').randomBytes(64).toString('hex');
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await user.save();
  res.status(201).json({ message: 'User created', userId: user._id, token: token, refreshToken: refreshToken });
});

// Complete profile after registration
router.put('/:id/complete-registration', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  user.initialQuestionnaireSubmitted = true;
  await user.save();
  res.status(200).json({ message: 'Profile updated' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });


  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error_code: 'INVALID_PASSWORD', error: 'Invalid credentials' });

  if (user.role !== 'Admin' && !user.approved) {
    return res.status(403).json({ error_code: 'NOT_APPROVED', message: 'User not approved by admin yet.' });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = require('crypto').randomBytes(64).toString('hex');
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await user.save();
  res.status(200).json({ token, refreshToken });
});


// Refresh endpoint
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  const user = await User.findOne({ refreshToken });
  if (!user) return res.status(401).json({ error_code: 'INVALID_REFRESH_TOKEN', error: 'Invalid refresh token' });

  if (!user.refreshTokenExpires || user.refreshTokenExpires < new Date()) {
    return res.status(401).json({ error_code: 'TOKEN_EXPIRED', error: 'Refresh token expired' });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const newRefreshToken = require('crypto').randomBytes(64).toString('hex');
  user.refreshToken = newRefreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await user.save();
  res.status(200).json({ token, refreshToken: newRefreshToken });
});


// Logout: remove refresh token
router.post('/logout', authenticate, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  user.refreshToken = null;
  await user.save();
  res.status(200).json({ message: 'Logged out' });
});

module.exports = router;