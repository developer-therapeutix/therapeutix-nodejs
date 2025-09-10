
const express = require('express');
const { authenticate } = require('./middleware/helper');
const { sendMail } = require('./middleware/mailer');
const { buildSupportRequestMail } = require('./mailing');
// DynamoDB repository (replaces Mongoose SupportRequest model)
const supportRepo = require('../models/supportRequestRepo');

const router = express.Router();

// Escape HTML to avoid breaking HTML emails or enabling injection
const escapeHtml = (str = '') =>
    String(str).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[ch]);

// Optional per-route payload size guard (after express.json limit)
const MAX_SUPPORT_PAYLOAD_BYTES = (Number(process.env.SUPPORT_MAX_PAYLOAD_MB || 10)) * 1024 * 1024; // default 10MB

router.post('/send', authenticate,  async (req, res) => {
    try {
        const { subject, message, attachments } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error_code: 'MISSING_FIELDS', error: 'Subject and message are required' });
        }
        // Guard extremely large payloads
        try {
            const estimated = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8');
            if (estimated > MAX_SUPPORT_PAYLOAD_BYTES) {
                return res.status(413).json({ error_code: 'PAYLOAD_TOO_LARGE', error: 'Support request payload too large' });
            }
        } catch (_) {
            // ignore size estimation errors
        }

        // Normalize attachments to metadata for DB (do not store raw base64)
        const normalizedAttachments = Array.isArray(attachments)
            ? attachments.map((a) => {
                  if (typeof a === 'string') {
                      return { filename: a.split('/').pop(), url: a };
                  }
                  if (a && typeof a === 'object') {
                      const filename = a.name || a.filename || 'attachment';
                      const mimeType = a.mime || a.mimeType;
                      if (a.data) {
                          const size = (() => { try { return Buffer.byteLength(a.data, 'base64'); } catch { return undefined; } })();
                          return { filename, mimeType, size };
                      }
                      return { filename, mimeType, url: a.url, key: a.key, size: a.size };
                  }
                  return undefined;
              }).filter(Boolean)
            : [];

        // Persist to DynamoDB
        const doc = await supportRepo.createSupportRequest({
            userId: req.user.userId,
            subject,
            message,
            attachments: normalizedAttachments
        });

        // Respond early so email latency doesn't block the client
    res.status(201).json({ message: 'Support request submitted successfully', ticketId: doc.ticketId });

        // Send emails asynchronously (no await)
        const htmlBody = `<div style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(message)}</div>`;

        // Build email-friendly attachments (Buffer for base64, or URL/path)
        const emailAttachments = Array.isArray(attachments)
            ? attachments.map((a) => {
                  if (typeof a === 'string') {
                      return { filename: a.split('/').pop(), path: a };
                  }
                  if (a && typeof a === 'object') {
                      const filename = a.name || a.filename || 'attachment';
                      const contentType = a.mime || a.mimeType;
                      if (a.data) {
                          try {
                              const content = Buffer.from(a.data, 'base64');
                              return { filename, content, contentType };
                          } catch {
                              return undefined;
                          }
                      }
                      if (a.url) {
                          return { filename, path: a.url, contentType };
                      }
                  }
                  return undefined;
              }).filter(Boolean)
            : [];

        sendMail({
            to: process.env.SUPPORT_EMAIL,
            subject: `[${doc.ticketId}] ${subject}`,
            text: message,
            html: `<p><strong>Ticket:</strong> ${doc.ticketId}</p>${htmlBody}`,
            attachments: emailAttachments,
        });

        // Confirmation to user
        const displayName = req.user.firstName || req.user.email;
        const messageHtml = htmlBody; // already escaped wrapper
        const supportHtml = buildSupportRequestMail({
            displayName: escapeHtml(displayName),
            subject: escapeHtml(subject),
            ticketId: escapeHtml(doc.ticketId),
            messageHtml,
            language: req.user.language
        });
        sendMail({
            to: req.user.email,
            subject: `Support Request Received (${doc.ticketId})`,
            text: `Dear ${displayName},\n\nWe have received your support request with the subject "${subject}". Your request will be handled under the ID ${doc.ticketId}. Our team will get back to you shortly.\n\nBest regards,\nTherapeutix Support Team`,
            html: supportHtml
        });
    } catch (err) {
        console.error('Support Request error:', err);
        res.status(500).json({ error_code: 'SUPPORT_SEND_FAILED', error: 'Could not submit support request' });
    }
});

module.exports = router;
