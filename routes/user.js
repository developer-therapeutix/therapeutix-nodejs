
const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { authenticate, requireRole } = require('./middleware/helper');

const router = express.Router();

// list all users (admin only)
router.get('/', authenticate, requireRole('Admin'), async (req, res) => {
  const users = await User.find();
  res.json(users);
});

router.get('/:id', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Get user by email
router.get('/email/:email', authenticate, async (req, res) => {
  const user = await User.findOne({ email: req.params.email });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.status(200).json(user);
});

// Update profile
router.put('/:id/update', authenticate, async (req, res) => {
  const { name, gender, firstName, lastName, birthday, phonenumber, address, housenumber, postalCode, city, country, password } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  if (name) user.name = name;
  if (gender) user.gender = gender;
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (birthday) user.birthday = birthday;
  if (phonenumber) user.phonenumber = phonenumber;
  if (address) user.address = address;
  if (housenumber) user.housenumber = housenumber;
  if (postalCode) user.postalCode = postalCode;
  if (city) user.city = city;
  if (country) user.country = country;
  if (password) user.password =  await bcrypt.hash(password, 10);

  await user.save();
  res.status(200).json({ message: 'Profile updated' });
});


router.put('/:id/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });

  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) return res.status(401).json({ error_code: 'INVALID_PASSWORD', error: 'Invalid credentials' });

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.status(200).json({ message: 'Password changed successfully' });
});



// Delete user (admin only)
router.delete('/:id', authenticate, requireRole('Admin'), async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  res.json({ message: 'User deleted' });
});

// Delete user self
router.delete('/me/delete', authenticate, async (req, res) => {
  const user = await User.findByIdAndDelete(req.user.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  res.status(200).json({ message: 'User deleted' });
});



// Approve user (admin only)
router.post('/:id/approve', authenticate, requireRole('Admin'), async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  user.approved = true;
  await user.save();
  res.json({ message: 'User approved' });
});


// Get current user's role
router.get('/:id/role', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  res.json({ role: user.role });
});


// Assign a video to a user as a task (admin, therapist and practice only)
router.post('/:id/assign-video', authenticate, requireRole('Admin', 'Therapist', 'Practice'), async (req, res) => {
  const { videoKey, title, description } = req.body;
  if (!videoKey) return res.status(400).json({ error_code: 'MISSING_VIDEO_KEY', error: 'videoKey required' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
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


// Enable or disable a user (admin only)
// Body: { "enabled": true } or { "enabled": false }
router.post('/:id/enable', authenticate, requireRole('Admin'), async (req, res) => {
  const { enabled } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  user.enabled = !!enabled;
  await user.save();
  res.json({ message: `User ${enabled ? 'enabled' : 'disabled'}` });
});

module.exports = router;