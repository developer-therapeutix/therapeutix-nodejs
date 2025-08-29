const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');

const router = express.Router();
// Check if email exists (async validation)
router.get('/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const user = await User.findOne({ email });
  res.json({ exists: !!user });
});

// Register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: 'Email already exists' });
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ email, password: hashedPassword });
  await user.save();
  res.status(201).json({ message: 'User created', userId: user._id });
});

// Complete profile after registration
router.put('/profile/:id', async (req, res) => {
  const { name, firstName, lastName, address, postalCode, city, country } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (name) user.name = name;
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (address) user.address = address;
  if (postalCode) user.postalCode = postalCode;
  if (city) user.city = city;
  if (country) user.country = country;
  await user.save();
  res.json({ message: 'Profile updated' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role !== 'Admin' && !user.approved) {
    return res.status(403).json({ status: 'not_approved', message: 'User not approved by admin yet.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

module.exports = router;