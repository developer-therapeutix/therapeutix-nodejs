require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/middleware/auth');
const userRoutes = require('./routes/user');
const questionnaireRoutes = require('./routes/questionnaire');

const app = express();
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/questionnaire', questionnaireRoutes);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));