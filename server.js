require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const authRoutes = require('./routes/middleware/auth');
const supportRoutes = require('./routes/support');
const userRoutes = require('./routes/user');
const questionnaireRoutes = require('./routes/questionnaire');

const app = express();
// Use a higher JSON limit only for support route to allow base64 attachments
const SUPPORT_JSON_LIMIT = process.env.SUPPORT_JSON_LIMIT || '20mb';
app.use('/api/support', express.json({ limit: SUPPORT_JSON_LIMIT }), supportRoutes);

// Default JSON parser for the rest of the API
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/questionnaire', questionnaireRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



// const { sendMail } = require('./mailer');
//  sendMail({
//   to: 'uemit.sahin@therapeutix.de',
//   subject: 'Test Email',
//   text: 'Hello from Therapeutix!',
//   html: '<b>Hello from Therapeutix!</b>'
// });