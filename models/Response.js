const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionnaire: { type: mongoose.Schema.Types.ObjectId, ref: 'Questionnaire', required: true },
  answers: mongoose.Schema.Types.Mixed, // flexible JSON-Struktur
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Response', responseSchema);