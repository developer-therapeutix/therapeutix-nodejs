const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  id: String,
  text: String,
  type: String
});

const questionnaireSchema = new mongoose.Schema({
  title: String,
  questions: [questionSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Questionnaire', questionnaireSchema);