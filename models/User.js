const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  approved: { type: Boolean, default: false },
  registrationComplete: { type: Boolean, default: false },
  initialQuestionnaireSubmitted: { type: Boolean, default: false },
  gender: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  birthday: { type: Date },
  address: { type: String },
  housenumber: { type: String },
  postalCode: { type: String },
  city: { type: String },
  country: { type: String },
  role: { type: String, enum: ['Admin', 'Practice', 'Therapist', 'Patient'], default: 'Patient' },
  refreshToken: { type: String },
  refreshTokenExpires: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);