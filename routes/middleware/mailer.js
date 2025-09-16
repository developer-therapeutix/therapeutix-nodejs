require('dotenv').config();
const nodemailer = require('nodemailer');

// Configurable sender addresses (override via env if needed)
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@therapeutix.de';
const NOREPLY_EMAIL = process.env.NOREPLY_EMAIL || 'no-reply@therapeutix.de';

// Optional friendly display names
const SUPPORT_FROM = `Therapeutix Support <${SUPPORT_EMAIL}>`;
const NOREPLY_FROM = `Therapeutix (No Reply) <${NOREPLY_EMAIL}>`;

// Primary (support) transporter
const supportTransporter = nodemailer.createTransport({
  host: 'mxe8b7.netcup.net',
  port: 465,
  secure: true,
  auth: {
    user: SUPPORT_EMAIL,
    pass: process.env.SUPPORT_EMAIL_PW
  }
});

// Optional distinct no-reply transporter (only if different mailbox + password provided)
const noReplyTransporter = nodemailer.createTransport({
  host: 'mxe8b7.netcup.net',
  port: 465,
  secure: true,
  auth: {
    user: NOREPLY_EMAIL,
    pass: process.env.NOREPLY_EMAIL_PW
  }
});

function resolveFrom({ from, fromType }) {
  if (from) return from; // explicit override
  if (fromType === 'noreply') return NOREPLY_FROM;
  return SUPPORT_FROM; // default
}

/**
 * Generic mail sender.
 * @param {Object} opts
 * @param {string} [opts.from] explicit full from header
 * @param {'support'|'noreply'} [opts.fromType='support'] convenience selector
 * @param {string|string[]} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text]
 * @param {string} [opts.html]
 * @param {Array} [opts.attachments]
 * @param {string|string[]} [opts.replyTo] override reply-to (e.g. route no-reply responses to support)
 */


async function sendMail({ from, fromType = 'support', to, subject, text, html, attachments, replyTo, envelopeFrom, headers }) {
  const resolvedFrom = resolveFrom({ from, fromType });
  const envelopeSender = envelopeFrom || (fromType === 'noreply' ? NOREPLY_EMAIL : SUPPORT_EMAIL);
  const transporter = fromType === 'noreply' ? noReplyTransporter : supportTransporter;

  const info = await transporter.sendMail({
    from: resolvedFrom,
    to,
    subject,
    text,
    html,
    replyTo,
    attachments: attachments || [],
    headers,
    // Ensure Return-Path / MAIL FROM matches desired sender so provider doesn't rewrite header
    envelope: {
      from: envelopeSender,
      to
    }
  });
  return info;
}

// Convenience wrappers
function sendSupportMail(opts) {
  return sendMail({ ...opts, fromType: 'support' });
}

// For no-reply we usually still provide a replyTo to direct accidental replies to support
function sendNoReplyMail(opts) {
  return sendMail({ replyTo: SUPPORT_EMAIL, envelopeFrom: NOREPLY_EMAIL, ...opts, fromType: 'noreply' });
}

module.exports = {
  sendMail,
  sendSupportMail,
  sendNoReplyMail,
};