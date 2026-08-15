import emailjs from 'emailjs-com'

const emailEndpoint = import.meta.env.VITE_EMAIL_ENDPOINT
const emailJsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID
const emailJsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const emailJsUserId = import.meta.env.VITE_EMAILJS_USER_ID

export function hasHostedEmailService() {
  return Boolean(emailEndpoint || (emailJsServiceId && emailJsTemplateId && emailJsUserId))
}

export async function sendEmailMessage(payload) {
  if (emailEndpoint) {
    const response = await fetch(emailEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error('Cloud email endpoint rejected the request.')
    }

    return response.json()
  }

  if (emailJsServiceId && emailJsTemplateId && emailJsUserId && !payload.attachmentName) {
    await emailjs.send(
      emailJsServiceId,
      emailJsTemplateId,
      {
        to_name: payload.toName,
        to_email: payload.toEmail,
        subject: payload.subject,
        message: payload.message,
      },
      emailJsUserId,
    )

    return { ok: true, mode: 'emailjs', messageId: `emailjs-${Date.now()}` }
  }

  return {
    ok: true,
    mode: 'demo',
    messageId: `demo-email-${Date.now()}`,
  }
}
