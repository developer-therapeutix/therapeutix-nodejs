
const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { authenticate, requireRole } = require('./middleware/helper');
const { sendMail } = require('./middleware/mailer');
const SupportRequest = require('../models/SupportRequest');
const path = require('path');

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

        // Persist to DB
    const doc = await SupportRequest.create({
            user: req.user._id,
            subject,
            message,
            attachments: normalizedAttachments,
        });

        console.log('Support Request saved:', doc._id.toString());

        // Respond early so email latency doesn't block the client
    res.status(201).json({ message: 'Support request submitted successfully', id: doc._id, ticketId: doc.ticketId });

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
        const footerImagePath = path.join(__dirname, '..', 'assets', 'images', 'Therapeutix_Logo+Claim_hoch.png');
        const brandColor = '#379596';
        // TODO: make responsive / mobile friendly
        // TODO: add translation / i18n

        const modernUserHtml = `<!doctype html>
        <html>
            <head>
                <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;">
                    <tr>
                        <td align="center" style="padding:32px 16px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background: #fbfdfd;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(17,24,39,0.08);">
                                <tr>
                                    <td style="background:${brandColor};padding:20px 24px;color: #ffffff;font-weight:600;font-size:18px;">
                                        Therapeutix Support
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:24px 24px 8px;">
                                        <h1 style="margin:0 0 8px;font-size:20px;line-height:28px;color:#111827;">We’ve received your request</h1>
                                        <p style="margin:0 0 4px;color: #374151;">Hello ${escapeHtml(displayName)},</p>
                                        <p style="margin:8px 0 0;color: #374151;">Thanks for contacting us. Your request has been created and will be handled under the ID <strong>${escapeHtml(doc.ticketId)}</strong>.</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 24px 0;">
                                        <div style="font-size:12px;color: #8c9692;margin-bottom:6px;">Subject</div>
                                        <div style="background: #f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;color: #111827;">
                                            <div style="font-size:14px;font-weight:600;">${escapeHtml(subject)}</div>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 24px 0;">
                                        <div style="font-size:12px;color: #8c9692;margin:0 0 6px;">Your message</div>
                                        <div style="background: #f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
                                            ${htmlBody}
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:20px 24px;color: #374151;">
                                        <p style="margin:0 0 12px;">We’ll get back to you shortly. If you need to add details, reply to this email and keep the ticket ID in the subject.</p>
                                        <p style="margin:0;color: #8c9692;font-size:12px;">Ticket ID: <strong>${escapeHtml(doc.ticketId)}</strong></p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:24px;text-align:center;border-top:1px solid #f3f4f6;">
                                        <img src="cid:tx-footer" alt="Therapeutix" align="center" style="display:inline-block;margin:0 auto;opacity:0.9;width:50%;max-width:240px;height:auto;"/>
                                        <div style="margin-top:8px;color: #8c9692;font-size:12px;">© ${new Date().getFullYear()} Therapeutix</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
        </html>`;

        sendMail({
            to: req.user.email,
            subject: `Support Request Received (${doc.ticketId})`,
            text: `Dear ${displayName},\n\nWe have received your support request with the subject "${subject}". Your request will be handled under the ID ${doc.ticketId}. Our team will get back to you shortly.\n\nBest regards,\nTherapeutix Support Team`,
                        html: modernUserHtml,
                        attachments: [
                            { filename: 'Therapeutix_Logo+Claim_hoch.png', path: footerImagePath, cid: 'tx-footer' }
                        ],
        });
    } catch (err) {
        console.error('Support Request error:', err);
        res.status(500).json({ error_code: 'SUPPORT_SEND_FAILED', error: 'Could not submit support request' });
    }
});

module.exports = router;
