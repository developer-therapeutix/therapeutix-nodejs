const getTranslation = (language) => {
  let fallback_language = 'en';
  if (!language) return fallback_language;

  language = (language).toLowerCase().slice(0, 2);
  language =  ['en', 'de'].includes(language) ? language : 'en';
  return translations[language] || translations['en'];
};

const translations = {
  en: {
    verify: {
      subject: "Please verify your email",
      title: 'Therapeutix - Email Verification',
      button: 'Verify Email',
      expiresIn: 'Please verify your email within the next 24 hours.'
    },
    subscribe: {
      subject: "Please verify your newsletter subscription",
      title: 'Therapeutix - Subscribe to Newsletter',
      button: 'Verify newsletter subscription',
      expiresIn: 'Please verify your newsletter subscription within the next 24 hours.'
    },
    reset: {
      subject: "Reset password",
      title: 'Therapeutix - Reset Password',
      button: 'Reset password',
      expiresIn: 'Please reset your password within the next 15 minutes.'
    },
    hints: {
        emailNotification: "Therapeutix will never ask you by email to disclose or verify your password, credit card, or bank account number. If you receive a suspicious email with a link to update your account information, do not click the link. Instead, forward the email to support@therapeutix.com."
    },
  },
  de: {
    verify: {
      subject: "Bitte bestätigen Sie Ihre E-Mail",
      title: 'Therapeutix - E-Mail Bestätigung',
      button: 'E-Mail bestätigen',
      expiresIn: 'Bitte bestätigen Sie Ihre E-Mail innerhalb der nächsten 24 Stunden.'
    },
    subscribe: {
      subject: "Bitte bestätigen Sie Ihr Newsletter-Abonnement",
      title: 'Therapeutix - Newsletter abonnieren',
      button: 'Newsletter-Abo bestätigen',
      expiresIn: 'Bitte bestätigen Sie Ihr Newsletter-Abonnement innerhalb der nächsten 24 Stunden.'
    },
    reset: {
      subject: "Passwort zurücksetzen",
      title: 'Therapeutix - Passwort zurücksetzen',
      button: 'Passwort zurücksetzen',
      expiresIn: 'Bitte setzen Sie Ihr Passwort innerhalb der nächsten 15 Minuten zurück.'
    },
    hints: {
        emailNotification: "Therapeutix wird Sie niemals per E-Mail dazu auffordern, Ihr Passwort, Ihre Kreditkarte oder Bankkontonummer offenzulegen oder zu überprüfen. Wenn Sie eine verdächtige E-Mail mit einem Link zum Aktualisieren Ihrer Kontoinformationen erhalten, klicken Sie nicht auf den Link. Leiten Sie die E-Mail stattdessen an support@therapeutix.de zur Untersuchung weiter."
    }
  }
};

module.exports = { getTranslation };