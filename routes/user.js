
const express = require('express');
const bcrypt = require('bcrypt');
// Switched from Mongoose model to DynamoDB repository
const userRepo = require('../models/userRepo');
const { authenticate, requireRole } = require('./middleware/helper');

const router = express.Router();

// list all users (admin only)
router.get('/', authenticate, requireRole('Admin'), async (req, res) => {
  const { users, lastEvaluatedKey } = await userRepo.listUsers({});
  // Optionally strip password hashes
  const sanitized = users.map(u => { const { password, ...rest } = u; return rest; });
  res.json({ users: sanitized, lastEvaluatedKey });
});

router.get('/:id', authenticate, async (req, res) => {
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...rest } = user;
  res.json(rest);
});

// Get user by email
router.get('/email/:email', authenticate, async (req, res) => {
  const user = await userRepo.getUserByEmail(req.params.email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password, ...rest } = user;
  res.status(200).json(rest);
});

// Update profile
router.put('/:id/update', authenticate, async (req, res) => {
  const { name, gender, firstName, lastName, birthday, phonenumber, address, housenumber, postalCode, city, country, diagnosisGroup, password } = req.body;
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  const update = {};
  if (name) update.name = name;
  if (gender) update.gender = gender;
  if (firstName) update.firstName = firstName;
  if (lastName) update.lastName = lastName;
  if (birthday) update.birthday = birthday;
  if (phonenumber) update.phonenumber = phonenumber;
  if (address) update.address = address;
  if (housenumber) update.housenumber = housenumber;
  if (postalCode) update.postalCode = postalCode;
  if (city) update.city = city;
  if (country) update.country = country;
  if (diagnosisGroup) update.diagnosisGroup = diagnosisGroup;
  if (password) update.password = await bcrypt.hash(password, 10);
  await userRepo.updateUser(user.userId, update);
  res.status(200).json({ message: 'Profile updated' });
});


// router.put('/:id/upload-prescription', authenticate, async (req, res) => {
//   const { prescription } = req.body;
//   const user = await userRepo.getUserById(req.params.id);
//   if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
//   if (!prescription) return res.status(400).json({ error_code: 'MISSING_PRESCRIPTION', error: 'Prescription is required' });
//   // Upload prescription base64 image or URL to S3 and save the S3 key or URL in user's profile
  
//   await userRepo.uploadPrescription(user.userId, prescription);
//   res.status(200).json({ message: 'Prescription uploaded successfully' });
// });

router.put('/:id/change-password', authenticate, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) return res.status(401).json({ error_code: 'INVALID_PASSWORD', error: 'Invalid credentials' });
  const hashed = await bcrypt.hash(newPassword, 10);
  await userRepo.updateUser(user.userId, { password: hashed });
  res.status(200).json({ message: 'Password changed successfully' });
});



// Delete user (admin only)
router.delete('/:id', authenticate, requireRole('Admin'), async (req, res) => {
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  await userRepo.deleteUser(user.userId);
  res.json({ message: 'User deleted' });
});

// Delete user self
router.delete('/me/delete', authenticate, async (req, res) => {
  const user = await userRepo.getUserById(req.user.userId);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  await userRepo.deleteUser(user.userId);
  res.status(200).json({ message: 'User deleted' });
});



// Approve user (admin only)
router.post('/:id/approve', authenticate, requireRole('Admin'), async (req, res) => {
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  await userRepo.updateUser(user.userId, { approved: true });
  res.json({ message: 'User approved' });
});


// Get current user's role
router.get('/:id/role', authenticate, async (req, res) => {
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  res.json({ role: user.role });
});


// Assign a video to a user as a task (admin, therapist and practice only)
router.post('/:id/assign-video', authenticate, requireRole('Admin', 'Therapist', 'Practice'), async (req, res) => {
  const { videoKey, title, description } = req.body;
  if (!videoKey) return res.status(400).json({ error_code: 'MISSING_VIDEO_KEY', error: 'videoKey required' });
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  const tasks = user.tasks || [];
  tasks.push({
    videoKey,
    title: title || 'Video Task',
    description: description || '',
    assignedAt: new Date().toISOString()
  });
  await userRepo.updateUser(user.userId, { tasks });
  res.json({ message: 'Video assigned as task', tasks });
});


// Enable or disable a user (admin only)
// Body: { "enabled": true } or { "enabled": false }
router.post('/:id/enable', authenticate, requireRole('Admin'), async (req, res) => {
  const { enabled } = req.body;
  const user = await userRepo.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error_code: 'USER_NOT_FOUND', error: 'User not found' });
  await userRepo.updateUser(user.userId, { enabled: !!enabled });
  res.json({ message: `User ${enabled ? 'enabled' : 'disabled'}` });
});

module.exports = router;