export function getEmailDeliveryStatus() {
  return {
    enabled: false,
    provider: 'none',
    configured: false,
    mode: 'in_app_only',
    reason: 'No email provider has been configured for this environment.',
  }
}

export function formatEmailTemplate({ title, body, userName = 'User' }) {
  const subject = `SkillBridge: ${String(title || 'Platform update')}`
  const message = String(body || 'Here is your latest update from SkillBridge.').trim()

  return {
    subject,
    body: `${userName},\n\n${message}\n\nThanks,\nSkillBridge Malawi`,
  }
}

export async function sendEmail({ to, subject, body, provider = 'console' }) {
  if (!to) {
    return {
      delivered: false,
      provider,
      status: 'rejected',
      reason: 'Recipient address is required before sending a notification email.',
    }
  }

  const status = getEmailDeliveryStatus()
  return {
    delivered: false,
    provider: status.provider,
    status: 'skipped',
    reason: status.reason,
    to,
    subject: subject || 'SkillBridge notification',
    body: body || 'No email content was supplied.',
  }
}
