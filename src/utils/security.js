const DANGEROUS_CHARS = /[<>"'`]/g
const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']

export function sanitizeText(value) {
  return String(value ?? '')
    .replace(DANGEROUS_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validatePhone(value) {
  return /^[0-9+\s()-]{8,20}$/.test(value)
}

export function validatePassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value)
}

export function validateMessageLength(value) {
  return value.length >= 20 && value.length <= 280
}

export function validateAttachment(file) {
  if (!file) {
    return { ok: true }
  }

  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, message: 'Attachment must stay below 2MB.' }
  }

  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return { ok: false, message: 'Attachment must be a PDF, PNG, JPG, or text file.' }
  }

  return { ok: true }
}

export function validateBookingDate(value) {
  if (!value) {
    return { ok: false, message: 'Please choose a booking date.' }
  }

  const selected = new Date(`${value}T00:00:00`)
  const now = new Date()
  const noticeHours = (selected.getTime() - now.getTime()) / (1000 * 60 * 60)
  const day = selected.getDay()

  if (noticeHours < 48) {
    return { ok: false, message: 'Bookings require at least 48 hours notice.' }
  }

  if (day === 0 || day === 6) {
    return { ok: false, message: 'Bookings are available on weekdays only.' }
  }

  return { ok: true }
}

export function escapeCsvValue(value) {
  const raw = String(value ?? '')
  const escaped = raw.replace(/"/g, '""')
  return `"${escaped}"`
}
