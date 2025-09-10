const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { authenticate } = require('./helper');
const { verifyMail, subscribeNewsletterMail, resetPasswordMail } = require('../mailing');
const { sendMail } = require('./mailer');
const { getTranslation } = require('../translations');

const router = express.Router();
// Check if email exists (async validation)
router.get('/check-email/:email', async (req, res) => {
  const { email } = req.params;
  const user = await User.findOne({ email });
  if (user) return res.status(400).json({ error_code: 'EMAIL_CLAIMED', error: 'Email is already claimed' });
  if (!user) return res.status(200).json({ error_code: 'EMAIL_AVAILABLE', error: 'Email is available' });
});


router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error_code: 'MISSING_TOKEN', error: 'Verification token required' });

  const user = await User.findOne({ emailVerificationToken: token });
  if (!user) return res.status(400).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });

  if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    return res.status(400).json({ error_code: 'TOKEN_EXPIRED', error: 'Verification token expired' });
  }

  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpires = null;
  await user.save();

  res.status(200).json({ message: 'Email verified' });
});

// Register
router.post('/register', async (req, res) => {
  const { email, password, eulaAccepted, newsletterSubscribed, language } = req.body;
  if (!email || !password) return res.status(400).json({ error_code: 'MISSING_CREDENTIALS', error: 'Email and password required' });
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error_code: 'EMAIL_EXISTS', error: 'Email already exists' });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword, eulaAccepted, language });

  const translation = getTranslation(language);

  // Send subscribe newsletter email
  if (newsletterSubscribed) {
    const subscribeNewsletterToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
    user.subscribeNewsletterToken = subscribeNewsletterToken;
    user.subscribeNewsletterExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day
    await user.save();

    try {
      await sendMail({
        to: user.email,
        subject: translation.subscribe.subject || 'Confirm subscription to our newsletter',
        html: subscribeNewsletterMail(subscribeNewsletterToken, user.language)
      });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ error_code: 'EMAIL_SEND_FAILED', error: 'Failed to send subscribe newsletter email' });
    }
  }

  // Send email verification email
  const emailVerificationToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  user.emailVerificationToken = emailVerificationToken;
  user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await user.save();

  // Send verification email
  try {
    await sendMail({
      to: user.email,
      subject: translation.verify.subject || 'Please verify your email',
      html: verifyMail(emailVerificationToken, user.language)
    });
  } catch (err) {
    return res.status(500).json({ error_code: 'EMAIL_SEND_FAILED', error: 'Failed to send verification email' });
  }

  res.status(201).json({ message: 'User created', userId: user._id, emailVerificationToken });
});

// Complete profile after registration
router.put('/:id/complete-registration', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  user.registrationComplete = true;
  await user.save();
  res.status(200).json({ message: 'Profile updated' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  if (user.disabled) return res.status(401).json({ error_code: 'USER_DISABLED', error: 'User is disabled' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error_code: 'INVALID_PASSWORD', error: 'Invalid credentials' });

  if (!user.emailVerified) return res.status(401).json({ error_code: 'EMAIL_NOT_VERIFIED', error: 'Email not verified' });

  if (user.role !== 'Admin' && !user.approved && user.createdAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
    return res.status(403).json({ error_code: 'NOT_APPROVED', message: 'User not approved by admin yet.' });
  }
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = require('crypto').randomBytes(64).toString('hex');
  user.refreshToken = refreshToken;
  user.refreshTokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  user.lastLogin = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  user.lastRefreshTokenAt = new Date();

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
  user.lastRefreshTokenAt = new Date();
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




router.post('/send-reset-password-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error_code: 'MISSING_EMAIL', error: 'Email is required' });
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  const resetPasswordToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '15m' });
  user.resetPasswordToken = resetPasswordToken;
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await user.save();

  const translation = getTranslation(user.language);

  // Send reset password email
  try {
    await sendMail({
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

  const user = await User.findOne({ resetPasswordToken: token });
  if (!user) return res.status(400).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });

  if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
    return res.status(400).json({ error_code: 'TOKEN_EXPIRED', error: 'Reset token expired' });
  }
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  user.password = hashedPassword;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  res.status(200).json({ message: 'Password reset successful' });
});

router.get('/subscribe-newsletter', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error_code: 'MISSING_TOKEN', error: 'Reset token required' });

  const user = await User.findOne({ subscribeNewsletterToken: token });
  if (!user) return res.status(400).json({ error_code: 'INVALID_TOKEN', error: 'Invalid token' });

  if (!user.subscribeNewsletterToken || user.subscribeNewsletterExpires < new Date()) {
    return res.status(400).json({ error_code: 'TOKEN_EXPIRED', error: 'Newsletter token expired' });
  }

  user.newsletterSubscribed = true;
  user.subscribeNewsletterToken = null;
  user.subscribeNewsletterExpires = null;
  await user.save();

  res.status(200).json({ message: 'Newsletter subscription successful' });
});

module.exports = router;