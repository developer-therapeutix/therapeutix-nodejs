const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { authenticate, requireRole } = require('./middleware/helper');

const router = express.Router();

// Get current user's role
router.get('/role', authenticate, async (req, res) => {
  res.json({ role: req.user.role });
});

// Update profile (self)
router.put('/profile', authenticate, async (req, res) => {
  const { email, password, firstName, lastName, address, postalCode, city, country } = req.body;
  if (email) req.user.email = email;
  if (password) req.user.password = await bcrypt.hash(password, 10);
  if (firstName) req.user.firstName = firstName;
  if (lastName) req.user.lastName = lastName;
  if (address) req.user.address = address;
  if (postalCode) req.user.postalCode = postalCode;
  if (city) req.user.city = city;
  if (country) req.user.country = country;
  await req.user.save();
  res.json({ message: 'Profile updated' });
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireRole('Admin'), async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

// Approve user (admin only)
router.post('/:id/approve', authenticate, requireRole('Admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.approved = true;
  await user.save();
  res.json({ message: 'User approved' });
});


// Assign a video to a user as a task
router.post('/:id/assign-video', authenticate, requireRole('Admin', 'Therapist', 'Practice'), async (req, res) => {
  const { videoKey, title, description } = req.body;
  if (!videoKey) return res.status(400).json({ error: 'videoKey required' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.tasks) user.tasks = [];
  user.tasks.push({
    videoKey,
    title: title || 'Video Task',
    description: description || '',
    assignedAt: new Date()
  });
  await user.save();
  res.json({ message: 'Video assigned as task', tasks: user.tasks });
});


module.exports = router;