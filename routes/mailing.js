
require('dotenv').config();
const { getTranslation } = require('./translations');
const brandColor = '#379596';


const buildEmailTemplate = ({ actionUrl, buttonText, emailNotification, headerImageURL = process.env.FRONTEND_URL + '/api/images/Therapeutix_Logo+Claim_Lang.png' }) => {
  return `<!doctype html>
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
                                <td style="background: #272929;padding:20px 24px;color: #ffffff;font-weight:600;font-size:18px;text-align:center;">
                                  <img src="${headerImageURL}" alt="Therapeutix" style="display:block;margin:0 auto;opacity:0.9;width:50%;max-width:240px;height:auto;"/>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:16px 24px 0;">
                                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center" style="padding-bottom:16px;">
                                                <a href="${actionUrl}" target="_blank" rel="noopener noreferrer" style="background:${brandColor};color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">${buttonText}</a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:24px;padding-top:10px;text-align:center;border-top:1px solid #f3f4f6;">
                                    <div style="margin:8px auto 0;color: #8c9692;font-size:12px;width:80%;text-align:center;display:block;">${emailNotification}</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
    </html>`;
};



const verifyMail = (emailVerificationToken, language) => {
  const { button } = getTranslation(language).verify;
  const verificationUrl = `${process.env.FRONTEND_URL}/api/auth/verify-email?token=${emailVerificationToken}`;
  return buildEmailTemplate({
    actionUrl: verificationUrl,
    buttonText: button,
    emailNotification: getTranslation(language).hints.emailNotification
  });
};

const subscribeNewsletterMail = (subscribeNewsletterToken, language) => {
  const { button } = getTranslation(language).subscribe;
  const subscribeUrl = `${process.env.FRONTEND_URL}/api/auth/subscribe-newsletter?token=${subscribeNewsletterToken}`;
  return buildEmailTemplate({
    actionUrl: subscribeUrl,
    buttonText: button,
    emailNotification: getTranslation(language).hints.emailNotification
  });
};

const resetPasswordMail = (resetPasswordToken, language) => {
  const { button } = getTranslation(language).reset;
  const resetUrl = `${process.env.FRONTEND_URL}/api/auth/reset-password?token=${resetPasswordToken}`;
  return buildEmailTemplate({
    actionUrl: resetUrl,
    buttonText: button,
    emailNotification: getTranslation(language).hints.emailNotification
  });
};


// Support request confirmation (reuses visual style but inlines custom body)
// messageHtml should already be sanitized/escaped as needed.
const buildSupportRequestMail = ({ displayName, subject, ticketId, messageHtml, language, headerImageURL = process.env.FRONTEND_URL + '/api/images/Therapeutix_Logo+Claim_Lang.png' }) => {
  const { requestReceived, hello, thankYou, ticketIdText, subjectText, messageText, bestRegards, team, moreInfo } = getTranslation(language).support;
  const year = new Date().getFullYear();
  // We embed the body where the button row normally sits.
  return `<!doctype html>
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
                  <td style="background: #272929;padding:20px 24px;color: #ffffff;font-weight:600;font-size:18px;text-align:center;">
                    <img src="${headerImageURL}" alt="Therapeutix" style="display:block;margin:0 auto;opacity:0.9;width:50%;max-width:240px;height:auto;"/>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 24px 8px;">
                    <h1 style="margin:0 0 8px;font-size:20px;line-height:28px;color:#111827;">${requestReceived}</h1>
                    <p style="margin:0 0 4px;color: #374151;">${hello} ${displayName},</p>
                    <p style="margin:8px 0 0;color: #374151;">${thankYou}</p>
                    <p style="margin:8px 0 0;color: #374151;">${ticketIdText} <strong>${ticketId}</strong>.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 24px 0;">
                    <div style="font-size:12px;color: #8c9692;margin-bottom:6px;">${subjectText}</div>
                    <div style="background: #f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;color: #111827;">
                      <div style="font-size:14px;font-weight:600;">${subject}</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px 0;">
                    <div style="font-size:12px;color: #8c9692;margin:0 0 6px;">${messageText}</div>
                    <div style="background: #f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">${messageHtml}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px;color: #374151;">
                    <p style="margin:0 0 12px;">${moreInfo}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px;text-align:center;border-top:1px solid #f3f4f6;">
                    <div style="margin:0 auto 8px;color: #8c9692;font-size:12px;width:80%;text-align:center;display:block;">${bestRegards},<br/>${team}</div>
                    <div style="margin-top:8px;color: #8c9692;font-size:12px;">© ${year} Therapeutix</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;
};

module.exports = {
  verifyMail,
  resetPasswordMail,
  subscribeNewsletterMail,
  buildEmailTemplate, // export in case of reuse
  buildSupportRequestMail
};

