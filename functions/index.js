const { onCall, onRequest } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const sgMail = require('@sendgrid/mail')

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

exports.sendSupportEmail = onRequest(async (request, response) => {
  try {
    const payload = request.body || {}

    if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
      response.status(200).json({
        ok: true,
        mode: 'demo',
        messageId: `demo-sendgrid-${Date.now()}`,
      })
      return
    }

    await sgMail.send({
      to: payload.toEmail,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: payload.subject,
      text: payload.message,
      attachments: payload.attachmentBase64
        ? [
            {
              content: payload.attachmentBase64,
              filename: payload.attachmentName,
              type: payload.attachmentType,
              disposition: 'attachment',
            },
          ]
        : [],
    })

    response.status(200).json({
      ok: true,
      mode: 'sendgrid',
      messageId: `sendgrid-${Date.now()}`,
    })
  } catch (error) {
    logger.error('sendSupportEmail failed', error)
    response.status(500).json({ ok: false, message: error.message })
  }
})

exports.generateBookingDigest = onCall(async (request) => {
  const bookings = request.data?.bookings || []
  const requests = request.data?.requests || []

  return {
    totalBookings: bookings.length,
    openRequests: requests.filter((item) => item.status !== 'Closed').length,
    generatedAt: new Date().toISOString(),
  }
})
