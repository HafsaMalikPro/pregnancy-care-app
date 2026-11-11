import type { EmailMessage } from './email-sender.js';

/**
 * Plain-text emails. They never include health details: reminder emails carry only the
 * user's own label (or a neutral default) and a link back to the website.
 */
export function passwordResetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    tag: 'password_reset',
    subject: 'Reset your Pregnancy Care password',
    text: [
      'Someone asked to reset the password for your Pregnancy Care account.',
      '',
      `Choose a new password here (the link works once and expires in 30 minutes):`,
      link,
      '',
      "If this wasn't you, ignore this email. Your password won't change.",
    ].join('\n'),
  };
}

export function verificationEmail(to: string, link: string): EmailMessage {
  return {
    to,
    tag: 'email_verification',
    subject: 'Confirm your email for Pregnancy Care',
    text: [
      'Please confirm this is your email address:',
      link,
      '',
      "The link expires in 24 hours. If you didn't create an account, ignore this email.",
    ].join('\n'),
  };
}

export const REMINDER_DEFAULT_TEXT: Record<string, string> = {
  daily_log: 'Time for your daily check-in.',
  readiness_checkin: 'Time to look at your checklist.',
  period_expected: 'A reminder you set in Pregnancy Care.',
  custom: 'A reminder you set in Pregnancy Care.',
};

export function reminderEmail(
  to: string,
  kind: string,
  label: string | null,
  appUrl: string,
): EmailMessage {
  const text =
    label ?? REMINDER_DEFAULT_TEXT[kind] ?? REMINDER_DEFAULT_TEXT.custom;
  return {
    to,
    tag: 'reminder',
    subject: text.length <= 60 ? text : 'Your Pregnancy Care reminder',
    text: [
      text,
      '',
      `Open Pregnancy Care: ${appUrl}/dashboard`,
      `Change or pause this reminder: ${appUrl}/reminders`,
    ].join('\n'),
  };
}

/**
 * Sent instead of an error when someone signs up with an address that already has an account
 * (security finding F-03), so the sign-up response cannot reveal who is registered.
 */
export function accountExistsEmail(
  to: string,
  signInLink: string,
): EmailMessage {
  return {
    to,
    tag: 'account_exists',
    subject: 'Someone tried to create a Pregnancy Care account with your email',
    text: [
      'Someone just tried to create a Pregnancy Care account with this email address, which',
      'already has an account.',
      '',
      'If it was you, sign in instead (you can reset your password from the sign-in page):',
      signInLink,
      '',
      "If it wasn't you, you can ignore this email. Nothing about your account has changed.",
    ].join('\n'),
  };
}
