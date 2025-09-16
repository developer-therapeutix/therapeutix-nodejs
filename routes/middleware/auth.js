const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepo = require('../../models/userRepo');
const { authenticate } = require('./helper');
const { verifyMail, subscribeNewsletterMail, resetPasswordMail } = require('../mailing');
const { sendNoReplyMail } = require('./mailer');
const { getTranslation } = require('../translations');

const router = express.Router();

// Check if email exists (async validation)
router.get('/check-email/:email', async (req, res) => {
  const { email } = req.params;
  const user = await userRepo.getUserByEmail(email);
  if (user) return res.status(400).json({ error_code: 'EMAIL_CLAIMED', error: 'Email is already claimed' });
  return res.status(200).json({ error_code: 'EMAIL_AVAILABLE', error: 'Email is available' });
});


router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error_code: 'MISSING_TOKEN', error: 'Verification token required' });

  const user = await userRepo.getUserByEmailVerificationToken(token);
  if (!user) return res.status(400).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });

  if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    return res.status(400).json({ error_code: 'TOKEN_EXPIRED', error: 'Verification token expired' });
  }

  await userRepo.updateUser(user.userId, {
    emailVerified: true,
    emailVerificationToken: null,
    emailVerificationExpires: null
  });

  res.status(200).json({ message: 'Email verified' });
});

// Register
router.post('/register', async (req, res) => {

  const start = Date.now();
  let hashDuration = 0;
  let createDuration = 0;
  let subscribeEmailDuration = 0;
  let verifyEmailDuration = 0;

  const { email, password, eulaAccepted, newsletterSubscribed, language } = req.body;
  if (!email || !password) {
    console.log(`[register] action=MISSING_CREDENTIALS email=${email || '-'} duration=${Date.now() - start}ms`);
    return res.status(400).json({ error_code: 'MISSING_CREDENTIALS', error: 'Email and password required' });
  }

  const existing = await userRepo.getUserByEmail(email);
  if (existing) {
    console.log(`[register] action=EMAIL_EXISTS email=${email} duration=${Date.now() - start}ms`);
    return res.status(409).json({ error_code: 'EMAIL_EXISTS', error: 'Email already exists' });
  }

  const hashStart = Date.now();
  const hashedPassword = await bcrypt.hash(password, 10);
  hashDuration = Date.now() - hashStart;
  console.log(`[register] action=PASSWORD_HASHED email=${email} hashDuration=${hashDuration}ms`);

  let user;
  try {
    const createStart = Date.now();
    user = await userRepo.createUser({ email, passwordHash: hashedPassword, eulaAccepted, language, newsletterSubscribed });
    createDuration = Date.now() - createStart;
    console.log(`[register] action=USER_CREATED email=${email} userId=${user.userId} createDuration=${createDuration}ms`);
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') {
      console.log(`[register] action=CREATE_FAILED_EMAIL_EXISTS email=${email} duration=${Date.now() - start}ms`);
      return res.status(409).json({ error_code: 'EMAIL_EXISTS', error: 'Email already exists' });
    }
    console.log(`[register] action=CREATE_FAILED email=${email} duration=${Date.now() - start}ms error=${err.message}`);
    return res.status(500).json({ error_code: 'CREATE_FAILED', error: 'Failed to create user' });
  }

  const translation = getTranslation(language);

  // Newsletter token (optional)
  let subscribeNewsletterToken;
  if (newsletterSubscribed) {
    subscribeNewsletterToken = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
    await userRepo.updateUser(user.userId, {
      subscribeNewsletterToken,
      subscribeNewsletterExpires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    try {
      const subscribeStart = Date.now();
      await sendNoReplyMail({
        to: user.email,
        subject: translation.subscribe.subject || 'Confirm subscription to our newsletter',
        html: subscribeNewsletterMail(subscribeNewsletterToken, user.language)
      });
      subscribeEmailDuration = Date.now() - subscribeStart;
      console.log(`[register] action=SUBSCRIBE_EMAIL_SENT email=${email} duration=${subscribeEmailDuration}ms`);
    } catch (err) {
      console.log(`[register] action=SUBSCRIBE_EMAIL_FAILED email=${email} duration=${Date.now() - start}ms error=${err.message}`);
      return res.status(500).json({ error_code: 'EMAIL_SEND_FAILED', error: 'Failed to send subscribe newsletter email' });
    }
  }

  const emailVerificationToken = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
  await userRepo.updateUser(user.userId, {
    emailVerificationToken,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });

  try {
    const verifyStart = Date.now();
    await sendNoReplyMail({
      to: user.email,
      subject: translation.verify.subject || 'Please verify your email',
      html: verifyMail(emailVerificationToken, user.language)
    });
    verifyEmailDuration = Date.now() - verifyStart;
    console.log(`[register] action=VERIFY_EMAIL_SENT email=${email} duration=${verifyEmailDuration}ms`);
  } catch (err) {
    console.log(`[register] action=VERIFY_EMAIL_FAILED email=${email} duration=${Date.now() - start}ms error=${err.message}`);
    return res.status(500).json({ error_code: 'EMAIL_SEND_FAILED', error: 'Failed to send verification email' });
  }

  const total = Date.now() - start;
  console.log(`[register] action=COMPLETE email=${email} userId=${user.userId} total=${total}ms hash=${hashDuration}ms create=${createDuration}ms subscribe=${subscribeEmailDuration}ms verify=${verifyEmailDuration}ms`);

  res.status(201).json({ message: 'User created', userId: user.userId, emailVerificationToken });
});

// Complete profile after registration
router.put('/:id/complete-registration', authenticate, async (req, res) => {
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  await userRepo.updateUser(user.userId, { registrationComplete: true });
  res.status(200).json({ message: 'Profile updated' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await userRepo.getUserByEmail(email);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  if (user.disabled) return res.status(401).json({ error_code: 'USER_DISABLED', error: 'User is disabled' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error_code: 'INVALID_PASSWORD', error: 'Invalid credentials' });

  if (!user.emailVerified) return res.status(401).json({ error_code: 'EMAIL_NOT_VERIFIED', error: 'Email not verified' });

  if (user.role !== 'Admin' && !user.approved && new Date(user.createdAt) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
    return res.status(403).json({ error_code: 'NOT_APPROVED', message: 'User not approved by admin yet.' });
  }
  const token = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  const refreshToken = require('crypto').randomBytes(64).toString('hex');
  await userRepo.updateUser(user.userId, {
    refreshToken,
    refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastLogin: new Date().toISOString(),
    loginCount: (user.loginCount || 0) + 1,
    lastRefreshTokenAt: new Date().toISOString()
  });
  res.status(200).json({ userId: user.userId, token, refreshToken });
});


// Refresh endpoint
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  const user = await userRepo.getUserByRefreshToken(refreshToken);
  if (!user) return res.status(401).json({ error_code: 'INVALID_REFRESH_TOKEN', error: 'Invalid refresh token' });

  if (!user.refreshTokenExpires || new Date(user.refreshTokenExpires) < new Date()) {
    return res.status(401).json({ error_code: 'TOKEN_EXPIRED', error: 'Refresh token expired' });
  }
  const token = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
  const newRefreshToken = require('crypto').randomBytes(64).toString('hex');
  await userRepo.updateUser(user.userId, {
    refreshToken: newRefreshToken,
    refreshTokenExpires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastRefreshTokenAt: new Date().toISOString()
  });
  res.status(200).json({ token, refreshToken: newRefreshToken });
});


// Logout: remove refresh token
router.post('/logout', authenticate, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  await userRepo.updateUser(user.userId, { refreshToken: null });
  res.status(200).json({ message: 'Logged out' });
});




router.post('/send-reset-password-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error_code: 'MISSING_EMAIL', error: 'Email is required' });
  const user = await userRepo.getUserByEmail(email);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  const resetPasswordToken = jwt.sign({ id: user.userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
  await userRepo.updateUser(user.userId, {
    resetPasswordToken,
    resetPasswordExpires: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });

  const translation = getTranslation(user.language);

  // Send reset password email
  try {
    await sendNoReplyMail({
      to: user.email,
      subject: translation.reset.subject || 'Reset your password',
      html: resetPasswordMail(resetPasswordToken, user.language)
    });
  } catch (err) {
    return res.status(500).json({ error_code: 'EMAIL_SEND_FAILED', error: 'Failed to send reset password email' });
  }

  res.status(200).json({ message: 'Reset password email sent' });
});

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error_code: 'MISSING_TOKEN', error: 'Reset token required' });

  const user = await userRepo.getUserByResetPasswordToken(token);
  if (!user) return res.status(400).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });

  if (!user.resetPasswordExpires || new Date(user.resetPasswordExpires) < new Date()) {
    return res.status(400).json({ error_code: 'TOKEN_EXPIRED', error: 'Reset token expired' });
  }
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  await userRepo.updateUser(user.userId, {
    password: hashedPassword,
    resetPasswordToken: null,
    resetPasswordExpires: null
  });

  res.status(200).json({ message: 'Password reset successful' });
});

router.get('/subscribe-newsletter', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error_code: 'MISSING_TOKEN', error: 'Reset token required' });

  const user = await userRepo.getUserBySubscribeNewsletterToken(token);
  if (!user) return res.status(400).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });

  if (!user.subscribeNewsletterToken || new Date(user.subscribeNewsletterExpires) < new Date()) {
    return res.status(400).json({ error_code: 'TOKEN_EXPIRED', error: 'Newsletter token expired' });
  }

  await userRepo.updateUser(user.userId, {
    newsletterSubscribed: true,
    subscribeNewsletterToken: null,
    subscribeNewsletterExpires: null
  });

  res.status(200).json({ message: 'Newsletter subscription successful' });
});

module.exports = router;