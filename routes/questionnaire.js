const express = require('express');
const Questionnaire = require('../models/Questionnaire');
const { authenticate, requireRole } = require('./middleware/helper'); 

const router = express.Router();

// Create a new questionnaire (Admin only)
router.post('/create', authenticate, requireRole('Admin'), async (req, res) => {
  try {
    const questionnaire = new Questionnaire(req.body);
    await questionnaire.save();
    res.status(201).json(questionnaire);
  } catch (err) {
    res.status(400).json({ error_code: 'QUESTIONNAIRE_CREATION_FAILED', error: err.message });
  }
});

// Get all questionnaires
router.get('/list', authenticate, async (req, res) => {
  const questionnaires = await Questionnaire.find();
  res.json(questionnaires);
});

// Get a single questionnaire by ID
router.get('/:id', authenticate, async (req, res) => {
  const questionnaire = await Questionnaire.findById(req.params.id);
  if (!questionnaire) return res.status(404).json({ error_code: 'QUESTIONNAIRE_NOT_FOUND', error: 'Not found' });
  res.json(questionnaire);
});

// Update a questionnaire (Admin only)
router.put('/:id/update', authenticate, requireRole('Admin'), async (req, res) => {
  const questionnaire = await Questionnaire.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!questionnaire) return res.status(404).json({ error_code: 'QUESTIONNAIRE_NOT_FOUND', error: 'Not found' });
  res.json(questionnaire);
});

// Delete a questionnaire (Admin only)
router.delete('/:id/delete', authenticate, requireRole('Admin'), async (req, res) => {
  const questionnaire = await Questionnaire.findByIdAndDelete(req.params.id);
  if (!questionnaire) return res.status(404).json({ error_code: 'QUESTIONNAIRE_NOT_FOUND', error: 'Not found' });
  res.json({ message: 'Deleted' });
});



module.exports = router;
