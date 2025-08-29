const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  approved: { type: Boolean, default: false },
  firstName: { type: String },
  lastName: { type: String },
  address: { type: String },
  postalCode: { type: String },
  city: { type: String },
  country: { type: String },
  role: { type: String, enum: ['Admin', 'Practice', 'Therapist', 'Patient'], default: 'Patient' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);