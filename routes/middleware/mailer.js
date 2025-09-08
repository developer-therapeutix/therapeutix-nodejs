require('dotenv').config();
const nodemailer = require('nodemailer');


const transporter = nodemailer.createTransport({
  host: 'mxe8b7.netcup.net',
  port: 465,
  secure: true,
  auth: {
    user: 'developer@therapeutix.de',
    pass: process.env.EMAIL_PASSWORD
  }
});

async function sendMail({ to, subject, text, html, attachments }) {
  const info = await transporter.sendMail({
    from: '"Therapeutix" <developer@therapeutix.de>',
    to,
    subject,
    text,
    html,
    attachments: attachments || []
  });
  return info;
}

module.exports = { sendMail };