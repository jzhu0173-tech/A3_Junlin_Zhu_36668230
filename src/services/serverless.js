export async function invokeTriageFunction(request) {
  const text = `${request.subject} ${request.message}`.toLowerCase()

  let priority = 'Low'
  if (text.includes('urgent') || text.includes('dialysis') || text.includes('burnout')) {
    priority = 'High'
  } else if (text.includes('support') || text.includes('appointment') || text.includes('review')) {
    priority = 'Medium'
  }

  return {
    priority,
    recommendedChannel: priority === 'High' ? 'Coordinator callback within 4 hours' : 'Standard follow-up',
  }
}

export async function invokeAvailabilityFunction(booking, existingBookings, service) {
  const sameSlotCount = existingBookings.filter(
    (entry) =>
      entry.serviceId === booking.serviceId &&
      entry.date === booking.date &&
      entry.time === booking.time &&
      entry.status !== 'Cancelled',
  ).length

  const remaining = Math.max(service.capacity - sameSlotCount, 0)
  return {
    available: remaining >= booking.seats,
    remaining,
    status: remaining >= booking.seats ? 'Confirmed' : 'Waitlisted',
  }
}

export async function invokeDigestFunction(bookings, requests, emails) {
  return {
    totalBookings: bookings.length,
    openRequests: requests.filter((request) => request.status !== 'Closed').length,
    outboundEmails: emails.length,
    generatedAt: new Date().toLocaleString(),
  }
}
