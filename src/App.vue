<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import L from 'leaflet'
import {
  activities,
  defaultUsers,
  services,
  starterBookings,
  starterRatings,
  starterRequests,
  suburbCenters,
} from './data/catalog'
import { downloadCsv, downloadPdf } from './utils/exporters'
import {
  sanitizeText,
  validateAttachment,
  validateBookingDate,
  validateEmail,
  validateMessageLength,
  validatePassword,
  validatePhone,
} from './utils/security'
import {
  invokeAvailabilityFunction,
  invokeDigestFunction,
  invokeTriageFunction,
} from './services/serverless'
import {
  isFirebaseConfigured,
  loginWithExternalAuth,
  loginWithGooglePopup,
  logoutExternalAuth,
  registerWithExternalAuth,
} from './services/firebase'
import { hasHostedEmailService, sendEmailMessage } from './services/email'

const PAGE_SIZE = 10

const storageKeys = {
  users: 'elderlink-a3-users',
  currentUser: 'elderlink-a3-current-user',
  requests: 'elderlink-a3-requests',
  bookings: 'elderlink-a3-bookings',
  ratings: 'elderlink-a3-ratings',
  emails: 'elderlink-a3-emails',
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function setNotice(type, message) {
  notice.type = type
  notice.message = message
}

function haversineKm(startLat, startLng, endLat, endLng) {
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadius = 6371
  const dLat = toRadians(endLat - startLat)
  const dLng = toRadians(endLng - startLng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(startLat)) *
      Math.cos(toRadians(endLat)) *
      Math.sin(dLng / 2) ** 2

  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function estimateTravel(distanceKm, mode) {
  const speeds = {
    car: 35,
    transit: 23,
    walk: 4.5,
  }
  const speed = speeds[mode] || 20
  return Math.max(Math.round((distanceKm / speed) * 60), 5)
}

function buildMarkerLabel(service) {
  return `<div class="map-pin">${service.name.slice(0, 1)}</div>`
}

function getPagedTable(rows, state, columns) {
  const filtered = rows.filter((row) =>
    columns.every((column) => {
      const value = String(row[column] ?? '').toLowerCase()
      const query = String(state.search[column] ?? '').toLowerCase()
      return !query || value.includes(query)
    }),
  )

  const sorted = [...filtered].sort((left, right) => {
    const leftValue = String(left[state.sortBy] ?? '').toLowerCase()
    const rightValue = String(right[state.sortBy] ?? '').toLowerCase()
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true })
    return state.sortDir === 'asc' ? comparison : -comparison
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(state.page, totalPages)
  const startIndex = (page - 1) * PAGE_SIZE

  return {
    rows: sorted.slice(startIndex, startIndex + PAGE_SIZE),
    totalPages,
    totalRows: sorted.length,
    page,
  }
}

const users = ref(readStorage(storageKeys.users, defaultUsers))
const currentUser = ref(readStorage(storageKeys.currentUser, null))
const serviceRequests = ref(readStorage(storageKeys.requests, starterRequests))
const bookings = ref(readStorage(storageKeys.bookings, starterBookings))
const ratings = ref(readStorage(storageKeys.ratings, starterRatings))
const emailLog = ref(readStorage(storageKeys.emails, []))

const currentView = ref('dashboard')
const highContrast = ref(false)
const largeText = ref(false)

const notice = reactive({
  type: 'info',
  message:
    'A3 demo mode is active. Firebase Auth, SendGrid, and Cloud Functions adapters are wired and will switch on when environment variables are configured.',
})

const loginForm = reactive({
  email: '',
  password: '',
})

const registerForm = reactive({
  fullName: '',
  email: '',
  password: '',
  role: 'resident',
})

const requestForm = reactive({
  serviceId: services[0].id,
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
})

const bookingForm = reactive({
  serviceId: services[0].id,
  date: '2026-08-25',
  time: '10:00',
  mode: 'Video consult',
  seats: 1,
  notes: '',
})

const emailForm = reactive({
  audience: 'Open requests',
  subject: 'Service update from ElderLink',
  message: '',
})

const matchProfile = reactive({
  need: 'Advice',
  language: 'English',
  mobility: 'low',
  budget: 'Free',
})

const directoryFilters = reactive({
  query: '',
  category: 'All',
  audience: 'All',
})

const mapState = reactive({
  selectedSuburb: suburbCenters[0].name,
  radiusKm: 8,
  serviceId: services[0].id,
  travelMode: 'car',
})

const serviceTableState = reactive({
  sortBy: 'name',
  sortDir: 'asc',
  page: 1,
  search: {
    name: '',
    category: '',
    suburb: '',
    audience: '',
  },
})

const bookingTableState = reactive({
  sortBy: 'date',
  sortDir: 'asc',
  page: 1,
  search: {
    residentName: '',
    serviceName: '',
    date: '',
    status: '',
  },
})

const mapElement = ref(null)
const outboundAttachment = ref(null)
const mapInstance = ref(null)
const markerLayer = ref(null)
const radiusLayer = ref(null)
const userPosition = ref({ ...suburbCenters[0] })

const categories = ['All', ...new Set(services.map((service) => service.category))]
const audiences = ['All', ...new Set(services.map((service) => service.audience))]
const isCoordinator = computed(() =>
  ['coordinator', 'admin'].includes(currentUser.value?.role || ''),
)

const filteredCards = computed(() => {
  const query = directoryFilters.query.toLowerCase()
  return services.filter((service) => {
    const matchesQuery =
      !query ||
      service.name.toLowerCase().includes(query) ||
      service.summary.toLowerCase().includes(query) ||
      service.suburb.toLowerCase().includes(query)
    const matchesCategory =
      directoryFilters.category === 'All' || service.category === directoryFilters.category
    const matchesAudience =
      directoryFilters.audience === 'All' || service.audience === directoryFilters.audience
    return matchesQuery && matchesCategory && matchesAudience
  })
})

const requestsTableRows = computed(() =>
  serviceRequests.value.map((request) => ({
    requestedBy: request.requestedBy,
    serviceName: request.serviceName,
    priority: request.priority,
    status: request.status,
    createdAt: request.createdAt,
  })),
)

const bookingsTableRows = computed(() => bookings.value)

const serviceTableView = computed(() =>
  getPagedTable(services, serviceTableState, ['name', 'category', 'suburb', 'audience']),
)

const bookingTableView = computed(() =>
  getPagedTable(bookingsTableRows.value, bookingTableState, [
    'residentName',
    'serviceName',
    'date',
    'status',
  ]),
)

const selectedMapService = computed(
  () => services.find((service) => service.id === Number(mapState.serviceId)) || services[0],
)

const nearbyServices = computed(() =>
  services
    .map((service) => ({
      ...service,
      distanceKm: haversineKm(
        userPosition.value.latitude,
        userPosition.value.longitude,
        service.latitude,
        service.longitude,
      ),
    }))
    .filter((service) => service.distanceKm <= Number(mapState.radiusKm))
    .sort((left, right) => left.distanceKm - right.distanceKm),
)

const routeSummary = computed(() => {
  const service = selectedMapService.value
  const distanceKm = haversineKm(
    userPosition.value.latitude,
    userPosition.value.longitude,
    service.latitude,
    service.longitude,
  )

  return {
    distanceKm: distanceKm.toFixed(1),
    estimatedMinutes: estimateTravel(distanceKm, mapState.travelMode),
    suburb: userPosition.value.name,
  }
})

const ratingsByActivity = computed(() =>
  activities.map((activity) => {
    const related = ratings.value.filter((entry) => entry.activityId === activity.id)
    const average = related.length
      ? (related.reduce((sum, entry) => sum + entry.score, 0) / related.length).toFixed(1)
      : 'No ratings'
    return {
      ...activity,
      average,
      totalRatings: related.length,
      comments: related.slice(-3).reverse(),
    }
  }),
)

const chartByCategory = computed(() =>
  categories
    .filter((category) => category !== 'All')
    .map((category) => ({
      label: category,
      value: services.filter((service) => service.category === category).length,
    })),
)

const chartByStatus = computed(() =>
  ['Confirmed', 'Waitlisted', 'Open', 'Assigned', 'Escalated', 'Closed'].map((status) => ({
    label: status,
    value:
      bookings.value.filter((booking) => booking.status === status).length +
      serviceRequests.value.filter((request) => request.status === status).length,
  })),
)

const digest = computed(async () =>
  invokeDigestFunction(bookings.value, serviceRequests.value, emailLog.value),
)

const campaignRecipients = computed(() => {
  if (emailForm.audience === 'Open requests') {
    return serviceRequests.value
      .filter((request) => request.status !== 'Closed')
      .map((request) => ({ name: request.requestedBy, email: request.email }))
  }

  if (emailForm.audience === 'Confirmed bookings') {
    return bookings.value
      .filter((booking) => booking.status === 'Confirmed')
      .map((booking) => ({ name: booking.residentName, email: booking.residentEmail }))
  }

  return users.value.map((user) => ({ name: user.fullName, email: user.email }))
})

const matchedServices = computed(() => {
  const need = matchProfile.need.toLowerCase()
  return services
    .map((service) => {
      let score = 0
      if (service.category.toLowerCase().includes(need)) score += 3
      if (service.languages.includes(matchProfile.language)) score += 2
      if (matchProfile.mobility === 'low' && service.tags.includes('mobility')) score += 2
      if (matchProfile.budget === 'Free' && /free|subsidised|bulk billed/i.test(service.cost)) score += 2
      return { ...service, score }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
})

watch(
  users,
  (value) => localStorage.setItem(storageKeys.users, JSON.stringify(value)),
  { deep: true },
)
watch(
  currentUser,
  (value) => localStorage.setItem(storageKeys.currentUser, JSON.stringify(value)),
  { deep: true },
)
watch(
  serviceRequests,
  (value) => localStorage.setItem(storageKeys.requests, JSON.stringify(value)),
  { deep: true },
)
watch(
  bookings,
  (value) => localStorage.setItem(storageKeys.bookings, JSON.stringify(value)),
  { deep: true },
)
watch(
  ratings,
  (value) => localStorage.setItem(storageKeys.ratings, JSON.stringify(value)),
  { deep: true },
)
watch(
  emailLog,
  (value) => localStorage.setItem(storageKeys.emails, JSON.stringify(value)),
  { deep: true },
)

watch(
  () => mapState.selectedSuburb,
  (value) => {
    const suburb = suburbCenters.find((entry) => entry.name === value)
    if (suburb) {
      userPosition.value = { ...suburb }
    }
  },
)

watch(
  [currentView, selectedMapService, nearbyServices, () => mapState.radiusKm],
  async () => {
    if (currentView.value !== 'map') {
      return
    }

    await nextTick()
    syncMap()
  },
  { deep: true },
)

function toggleA11yMode(mode) {
  if (mode === 'contrast') {
    highContrast.value = !highContrast.value
    return
  }

  largeText.value = !largeText.value
}

function sortTable(tableState, column) {
  if (tableState.sortBy === column) {
    tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc'
  } else {
    tableState.sortBy = column
    tableState.sortDir = 'asc'
  }
}

function resetPage(tableState) {
  tableState.page = 1
}

function changePage(tableState, nextPage, totalPages) {
  tableState.page = Math.min(Math.max(nextPage, 1), totalPages)
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const [, base64 = ''] = result.split(',')
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Attachment could not be processed.'))
    reader.readAsDataURL(file)
  })
}

async function registerUser() {
  const payload = {
    fullName: sanitizeText(registerForm.fullName),
    email: sanitizeText(registerForm.email).toLowerCase(),
    password: sanitizeText(registerForm.password),
  }

  if (!payload.fullName || !payload.email || !payload.password) {
    setNotice('error', 'Registration needs a full name, email, and password.')
    return
  }

  if (!validateEmail(payload.email)) {
    setNotice('error', 'Please use a valid email address for registration.')
    return
  }

  if (!validatePassword(payload.password)) {
    setNotice('error', 'Password must be at least 8 characters and include both letters and numbers.')
    return
  }

  if (users.value.some((user) => user.email === payload.email)) {
    setNotice('error', 'That email already exists in the ElderLink account list.')
    return
  }

  try {
    const externalUser = await registerWithExternalAuth(payload)
    const newUser = {
      id: Date.now(),
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      role: registerForm.role,
      authProvider: externalUser.providerId || 'firebase',
    }

    users.value = [...users.value, newUser]
    currentUser.value = newUser
    registerForm.fullName = ''
    registerForm.email = ''
    registerForm.password = ''
    registerForm.role = 'resident'
    setNotice(
      'success',
      `External authentication ${isFirebaseConfigured() ? 'connected through Firebase' : 'ran in demo mode'} and the account is ready.`,
    )
  } catch (error) {
    setNotice('error', error.message)
  }
}

async function loginUser() {
  const email = sanitizeText(loginForm.email).toLowerCase()
  const password = sanitizeText(loginForm.password)
  const matchedUser = users.value.find((user) => user.email === email && user.password === password)

  if (!matchedUser) {
    setNotice('error', 'Login failed. Check the demo credentials or the account you created.')
    return
  }

  try {
    await loginWithExternalAuth({ email, password })
    currentUser.value = matchedUser
    loginForm.email = ''
    loginForm.password = ''
    setNotice('success', `Welcome back, ${matchedUser.fullName}.`)
  } catch (error) {
    setNotice('error', error.message)
  }
}

async function loginWithGoogle() {
  try {
    const externalUser = await loginWithGooglePopup()
    const existing = users.value.find((user) => user.email === externalUser.email)

    if (existing) {
      currentUser.value = existing
    } else {
      const generated = {
        id: Date.now(),
        fullName: externalUser.displayName || 'Google User',
        email: externalUser.email,
        password: 'ExternalProvider',
        role: 'resident',
        authProvider: externalUser.providerId || 'google.com',
      }
      users.value = [...users.value, generated]
      currentUser.value = generated
    }

    setNotice(
      'success',
      `Google-style external sign-in completed ${isFirebaseConfigured() ? 'through Firebase' : 'in demo fallback mode'}.`,
    )
  } catch (error) {
    setNotice('error', error.message)
  }
}

async function logoutUser() {
  await logoutExternalAuth()
  currentUser.value = null
  currentView.value = 'dashboard'
  setNotice('info', 'You have been signed out.')
}

async function submitSupportRequest() {
  const payload = {
    serviceId: Number(requestForm.serviceId),
    name: sanitizeText(requestForm.name),
    email: sanitizeText(requestForm.email).toLowerCase(),
    phone: sanitizeText(requestForm.phone),
    subject: sanitizeText(requestForm.subject),
    message: sanitizeText(requestForm.message),
  }

  if (!payload.name || !payload.email || !payload.phone || !payload.subject || !payload.message) {
    setNotice('error', 'The support request form requires all fields.')
    return
  }

  if (!validateEmail(payload.email) || !validatePhone(payload.phone)) {
    setNotice('error', 'Please check the email and phone format before submitting.')
    return
  }

  if (!validateMessageLength(payload.message)) {
    setNotice('error', 'Support request messages must stay between 20 and 280 characters.')
    return
  }

  const service = services.find((entry) => entry.id === payload.serviceId) || services[0]
  const triage = await invokeTriageFunction(payload)

  serviceRequests.value = [
    {
      id: Date.now(),
      serviceId: payload.serviceId,
      serviceName: service.name,
      requestedBy: payload.name,
      email: payload.email,
      phone: payload.phone,
      subject: payload.subject,
      message: payload.message,
      priority: triage.priority,
      status: triage.priority === 'High' ? 'Escalated' : 'Open',
      createdAt: new Date().toLocaleString(),
    },
    ...serviceRequests.value,
  ]

  requestForm.name = ''
  requestForm.email = currentUser.value?.email || ''
  requestForm.phone = ''
  requestForm.subject = ''
  requestForm.message = ''
  setNotice('success', `Request triaged as ${triage.priority}. ${triage.recommendedChannel}.`)
}

async function createBooking() {
  if (!currentUser.value) {
    setNotice('warning', 'Please log in before creating a booking.')
    return
  }

  const validation = validateBookingDate(bookingForm.date)
  if (!validation.ok) {
    setNotice('error', validation.message)
    return
  }

  const service = services.find((entry) => entry.id === Number(bookingForm.serviceId)) || services[0]
  const nextBooking = {
    id: Date.now(),
    serviceId: service.id,
    serviceName: service.name,
    residentName: currentUser.value.fullName,
    residentEmail: currentUser.value.email,
    date: bookingForm.date,
    time: bookingForm.time,
    mode: sanitizeText(bookingForm.mode),
    seats: Number(bookingForm.seats),
    notes: sanitizeText(bookingForm.notes),
  }

  const availability = await invokeAvailabilityFunction(nextBooking, bookings.value, service)
  bookings.value = [
    {
      ...nextBooking,
      status: availability.status,
    },
    ...bookings.value,
  ]

  bookingForm.notes = ''
  setNotice(
    availability.available
      ? 'success'
      : 'warning',
    availability.available
      ? `Booking confirmed. ${availability.remaining - nextBooking.seats} seats remain in this slot.`
      : 'The requested slot is full, so the booking has been waitlisted automatically.',
  )
}

async function sendCampaign() {
  if (!isCoordinator.value) {
    setNotice('warning', 'Bulk email tools are restricted to coordinator and admin roles.')
    return
  }

  const subject = sanitizeText(emailForm.subject)
  const message = sanitizeText(emailForm.message)

  if (!subject || !message) {
    setNotice('error', 'Bulk email needs both a subject and a message.')
    return
  }

  const attachmentCheck = validateAttachment(outboundAttachment.value)
  if (!attachmentCheck.ok) {
    setNotice('error', attachmentCheck.message)
    return
  }

  const recipients = campaignRecipients.value
  if (!recipients.length) {
    setNotice('error', 'No recipients matched the selected bulk email audience.')
    return
  }

  const attachmentBase64 = await readFileAsBase64(outboundAttachment.value)

  for (const recipient of recipients) {
    const response = await sendEmailMessage({
      toName: recipient.name,
      toEmail: recipient.email,
      subject,
      message,
      attachmentName: outboundAttachment.value?.name || '',
      attachmentType: outboundAttachment.value?.type || '',
      attachmentBase64,
    })

    emailLog.value = [
      {
        id: Date.now() + Math.random(),
        toName: recipient.name,
        toEmail: recipient.email,
        subject,
        mode: response.mode,
        sentAt: new Date().toLocaleString(),
      },
      ...emailLog.value,
    ]
  }

  emailForm.message = ''
  outboundAttachment.value = null
  setNotice(
    'success',
    `Bulk email sent to ${recipients.length} recipients using ${hasHostedEmailService() ? 'the configured email integration' : 'demo email mode'}.`,
  )
}

function handleAttachmentChange(event) {
  const file = event.target.files?.[0] || null
  outboundAttachment.value = file
}

function exportServiceDirectory() {
  downloadCsv(
    'elderlink-services.csv',
    services.map((service) => ({
      name: service.name,
      category: service.category,
      suburb: service.suburb,
      audience: service.audience,
      phone: service.phone,
      cost: service.cost,
    })),
  )
  setNotice('success', 'Service directory exported to CSV.')
}

function exportBookingsSummary() {
  downloadPdf('elderlink-bookings.pdf', 'ElderLink bookings summary', [
    {
      heading: 'Overview',
      body: `Total bookings: ${bookings.value.length}. Confirmed bookings: ${
        bookings.value.filter((booking) => booking.status === 'Confirmed').length
      }. Waitlisted bookings: ${
        bookings.value.filter((booking) => booking.status === 'Waitlisted').length
      }.`,
    },
    ...bookings.value.slice(0, 12).map((booking) => ({
      heading: `${booking.residentName} - ${booking.serviceName}`,
      body: `${booking.date} at ${booking.time}. Mode: ${booking.mode}. Status: ${booking.status}. Contact: ${booking.residentEmail}.`,
    })),
  ])
  setNotice('success', 'Bookings summary exported to PDF.')
}

function exportRequestsCsv() {
  downloadCsv(
    'elderlink-requests.csv',
    serviceRequests.value.map((request) => ({
      requestedBy: request.requestedBy,
      serviceName: request.serviceName,
      priority: request.priority,
      status: request.status,
      createdAt: request.createdAt,
    })),
  )
  setNotice('success', 'Support requests exported to CSV.')
}

async function useCurrentLocation() {
  if (!navigator.geolocation) {
    setNotice('warning', 'Geolocation is not available in this browser.')
    return
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userPosition.value = {
        name: 'Your location',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      setNotice('success', 'Current location captured for nearby service search.')
      syncMap()
    },
    () => setNotice('error', 'Location permission was denied, so the suburb hub remained selected.'),
  )
}

function initMap() {
  if (mapInstance.value || !mapElement.value) {
    return
  }

  mapInstance.value = L.map(mapElement.value, {
    zoomControl: true,
    scrollWheelZoom: false,
  }).setView([userPosition.value.latitude, userPosition.value.longitude], 11)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(mapInstance.value)

  markerLayer.value = L.layerGroup().addTo(mapInstance.value)
  syncMap()
}

function syncMap() {
  if (!mapInstance.value) {
    return
  }

  mapInstance.value.invalidateSize()
  markerLayer.value?.clearLayers()

  if (radiusLayer.value) {
    radiusLayer.value.remove()
  }

  const userLatLng = [userPosition.value.latitude, userPosition.value.longitude]
  L.marker(userLatLng, {
    icon: L.divIcon({
      className: 'map-icon map-icon--user',
      html: '<div class="map-pin map-pin--user">You</div>',
    }),
  })
    .bindPopup(`${userPosition.value.name}`)
    .addTo(markerLayer.value)

  nearbyServices.value.forEach((service) => {
    L.marker([service.latitude, service.longitude], {
      icon: L.divIcon({
        className: 'map-icon',
        html: buildMarkerLabel(service),
      }),
    })
      .bindPopup(`${service.name}<br>${service.suburb}<br>${service.distanceKm.toFixed(1)} km away`)
      .addTo(markerLayer.value)
  })

  const selected = selectedMapService.value
  L.polyline(
    [
      [userPosition.value.latitude, userPosition.value.longitude],
      [selected.latitude, selected.longitude],
    ],
    { color: '#195e54', dashArray: '6 8' },
  ).addTo(markerLayer.value)

  radiusLayer.value = L.circle(userLatLng, {
    radius: Number(mapState.radiusKm) * 1000,
    color: '#2f7f73',
    fillColor: '#9bd1c6',
    fillOpacity: 0.18,
  }).addTo(mapInstance.value)

  mapInstance.value.fitBounds(radiusLayer.value.getBounds(), { padding: [24, 24] })
}

function switchView(view) {
  if (view === 'admin' && !isCoordinator.value) {
    setNotice('warning', 'Coordinator dashboard access is restricted by role.')
    currentView.value = 'dashboard'
    return
  }

  currentView.value = view
  if (view === 'map') {
    nextTick(() => {
      initMap()
      syncMap()
    })
  }
}

onMounted(() => {
  requestForm.email = currentUser.value?.email || ''
})
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--contrast': highContrast,
      'app-shell--large': largeText,
    }"
  >
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <header class="hero">
      <div class="hero__copy">
        <p class="eyebrow">FIT5032 A3 | Advanced web application prototype</p>
        <h1>ElderLink A3</h1>
        <p class="hero__lead">
          An accessible service coordination platform for older adults, carers, and community
          coordinators, now extended with external auth, cloud-ready messaging, maps, exports,
          analytics, and booking workflows.
        </p>
        <div class="hero__actions">
          <button class="button button--primary" @click="switchView('directory')">Open directory</button>
          <button class="button button--ghost" @click="switchView('map')">Map and routing</button>
          <button class="button button--ghost" @click="switchView('admin')">Coordinator dashboard</button>
        </div>
      </div>

      <div class="hero__panel">
        <p><strong>Demo resident:</strong> margaret@elderlink.demo / Welcome123</p>
        <p><strong>Demo coordinator:</strong> priya@elderlink.demo / Coordinator123</p>
        <p><strong>Demo admin:</strong> admin@elderlink.demo / Admin1234</p>
        <p>
          <strong>Integration mode:</strong>
          {{ isFirebaseConfigured() ? 'Firebase Auth ready' : 'Demo external-auth fallback' }}
        </p>
      </div>
    </header>

    <section class="stats-grid" aria-label="Summary statistics">
      <article class="stat-card">
        <span>{{ services.length }}</span>
        <p>services in directory</p>
      </article>
      <article class="stat-card">
        <span>{{ serviceRequests.length }}</span>
        <p>support requests tracked</p>
      </article>
      <article class="stat-card">
        <span>{{ bookings.length }}</span>
        <p>bookings with scheduling rules</p>
      </article>
      <article class="stat-card">
        <span>{{ emailLog.length }}</span>
        <p>outbound email records</p>
      </article>
    </section>

    <nav class="toolbar" aria-label="Primary navigation">
      <div class="toolbar__nav">
        <button class="nav-chip" :class="{ 'nav-chip--active': currentView === 'dashboard' }" @click="switchView('dashboard')">
          Dashboard
        </button>
        <button class="nav-chip" :class="{ 'nav-chip--active': currentView === 'directory' }" @click="switchView('directory')">
          Directory
        </button>
        <button class="nav-chip" :class="{ 'nav-chip--active': currentView === 'map' }" @click="switchView('map')">
          Map
        </button>
        <button class="nav-chip" :class="{ 'nav-chip--active': currentView === 'bookings' }" @click="switchView('bookings')">
          Bookings
        </button>
        <button class="nav-chip" :class="{ 'nav-chip--active': currentView === 'admin' }" @click="switchView('admin')">
          Coordinator
        </button>
      </div>

      <div class="toolbar__a11y">
        <button class="button button--small" @click="toggleA11yMode('contrast')">
          {{ highContrast ? 'Normal contrast' : 'High contrast' }}
        </button>
        <button class="button button--small" @click="toggleA11yMode('text')">
          {{ largeText ? 'Standard text' : 'Large text' }}
        </button>
      </div>
    </nav>

    <section class="notice" :class="`notice--${notice.type}`" aria-live="polite">
      {{ notice.message }}
    </section>

    <main id="main-content" class="content-grid">
      <aside class="card auth-card">
        <div class="card__header">
          <h2>External authentication</h2>
          <p>Designed for Firebase Auth, with Google-style external sign-in and demo fallback.</p>
        </div>

        <div v-if="currentUser" class="auth-state">
          <p class="auth-state__name">{{ currentUser.fullName }}</p>
          <p>{{ currentUser.email }}</p>
          <p class="role-pill">{{ currentUser.role }}</p>
          <p class="muted">Provider: {{ currentUser.authProvider }}</p>
          <button class="button button--primary" @click="logoutUser">Log out</button>
        </div>

        <template v-else>
          <div class="form-block">
            <h3>Login</h3>
            <label>
              Email
              <input v-model="loginForm.email" type="email" autocomplete="username" />
            </label>
            <label>
              Password
              <input v-model="loginForm.password" type="password" autocomplete="current-password" />
            </label>
            <button class="button button--primary" @click="loginUser">Log in</button>
            <button class="button button--ghost" @click="loginWithGoogle">Sign in with Google</button>
          </div>

          <div class="form-block">
            <h3>Register</h3>
            <label>
              Full name
              <input v-model="registerForm.fullName" type="text" />
            </label>
            <label>
              Email
              <input v-model="registerForm.email" type="email" autocomplete="email" />
            </label>
            <label>
              Password
              <input v-model="registerForm.password" type="password" autocomplete="new-password" />
            </label>
            <label>
              Role
              <select v-model="registerForm.role">
                <option value="resident">Resident / carer</option>
                <option value="coordinator">Coordinator</option>
              </select>
            </label>
            <button class="button button--primary" @click="registerUser">Create account</button>
          </div>
        </template>
      </aside>

      <section v-if="currentView === 'dashboard'" class="card page-card">
        <div class="card__header">
          <h2>Innovation overview</h2>
          <p>
            This A3 build combines external authentication, bookings with calendar constraints,
            export tools, analytics, bulk email, and a personalised care-match recommender.
          </p>
        </div>

        <div class="dashboard-grid">
          <article class="dashboard-card">
            <h3>Personalised care match</h3>
            <div class="request-form">
              <label>
                Support need
                <select v-model="matchProfile.need">
                  <option>Advice</option>
                  <option>Health</option>
                  <option>Home help</option>
                  <option>Transport</option>
                  <option>Social</option>
                </select>
              </label>
              <label>
                Preferred language
                <select v-model="matchProfile.language">
                  <option>English</option>
                  <option>Mandarin</option>
                  <option>Hindi</option>
                  <option>Greek</option>
                  <option>Vietnamese</option>
                  <option>Arabic</option>
                </select>
              </label>
              <label>
                Mobility need
                <select v-model="matchProfile.mobility">
                  <option value="low">Mobility support</option>
                  <option value="standard">Standard access</option>
                </select>
              </label>
              <label>
                Budget
                <select v-model="matchProfile.budget">
                  <option>Free</option>
                  <option>Any</option>
                </select>
              </label>
            </div>
            <div class="match-stack">
              <article v-for="service in matchedServices" :key="service.id" class="match-card">
                <strong>{{ service.name }}</strong>
                <p>{{ service.summary }}</p>
                <small>Match score: {{ service.score }} · {{ service.suburb }}</small>
              </article>
            </div>
          </article>

          <article class="dashboard-card">
            <h3>Activity ratings</h3>
            <div class="activity-grid activity-grid--dashboard">
              <article v-for="activity in ratingsByActivity" :key="activity.id" class="activity-card">
                <p class="service-card__tag">{{ activity.theme }}</p>
                <h4>{{ activity.title }}</h4>
                <p>{{ activity.day }} · {{ activity.time }}</p>
                <div class="rating-badge">
                  <strong>{{ activity.average }}</strong>
                  <span>{{ activity.totalRatings }} ratings</span>
                </div>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="currentView === 'directory'" class="card page-card">
        <div class="card__header">
          <h2>Interactive service directory</h2>
          <p>
            The directory supports responsive cards, triaged support requests, CSV export, and a
            full interactive table with column search, sorting, and 10 rows per page.
          </p>
        </div>

        <div class="filters">
          <label>
            Search services
            <input v-model="directoryFilters.query" type="text" placeholder="Transport, clinic, Mandarin..." />
          </label>
          <label>
            Category
            <select v-model="directoryFilters.category">
              <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
            </select>
          </label>
          <label>
            Audience
            <select v-model="directoryFilters.audience">
              <option v-for="audience in audiences" :key="audience" :value="audience">{{ audience }}</option>
            </select>
          </label>
          <button class="button button--small" @click="exportServiceDirectory">Export services CSV</button>
        </div>

        <div class="service-grid">
          <article v-for="service in filteredCards" :key="service.id" class="service-card">
            <div class="service-card__top">
              <p class="service-card__tag">{{ service.category }}</p>
              <span class="distance-pill">{{ service.suburb }}</span>
            </div>
            <h3>{{ service.name }}</h3>
            <p>{{ service.summary }}</p>
            <ul class="meta-list">
              <li>{{ service.audience }}</li>
              <li>{{ service.cost }}</li>
              <li>{{ service.accessibility }}</li>
              <li>{{ service.phone }}</li>
            </ul>
          </article>
        </div>

        <div class="request-layout">
          <div>
            <h3>Support request triage</h3>
            <p>
              This form validates required fields, email, phone, and message length, then uses a
              cloud-function-style triage rule to prioritise follow-up.
            </p>
          </div>

          <div class="request-form">
            <label>
              Service
              <select v-model="requestForm.serviceId">
                <option v-for="service in services" :key="service.id" :value="service.id">{{ service.name }}</option>
              </select>
            </label>
            <label>
              Name
              <input v-model="requestForm.name" type="text" />
            </label>
            <label>
              Email
              <input v-model="requestForm.email" type="email" />
            </label>
            <label>
              Phone
              <input v-model="requestForm.phone" type="tel" />
            </label>
            <label>
              Subject
              <input v-model="requestForm.subject" type="text" />
            </label>
            <label>
              Message
              <textarea v-model="requestForm.message" rows="4" />
            </label>
            <button class="button button--primary" @click="submitSupportRequest">Submit request</button>
          </div>
        </div>

        <div class="table-card">
          <div class="table-card__header">
            <h3>Service table</h3>
            <p>{{ serviceTableView.totalRows }} matching rows</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><button class="sort-button" @click="sortTable(serviceTableState, 'name')">Name</button></th>
                  <th><button class="sort-button" @click="sortTable(serviceTableState, 'category')">Category</button></th>
                  <th><button class="sort-button" @click="sortTable(serviceTableState, 'suburb')">Suburb</button></th>
                  <th><button class="sort-button" @click="sortTable(serviceTableState, 'audience')">Audience</button></th>
                </tr>
                <tr>
                  <th><input v-model="serviceTableState.search.name" type="text" placeholder="Filter name" @input="resetPage(serviceTableState)" /></th>
                  <th><input v-model="serviceTableState.search.category" type="text" placeholder="Filter category" @input="resetPage(serviceTableState)" /></th>
                  <th><input v-model="serviceTableState.search.suburb" type="text" placeholder="Filter suburb" @input="resetPage(serviceTableState)" /></th>
                  <th><input v-model="serviceTableState.search.audience" type="text" placeholder="Filter audience" @input="resetPage(serviceTableState)" /></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="service in serviceTableView.rows" :key="service.id">
                  <td>{{ service.name }}</td>
                  <td>{{ service.category }}</td>
                  <td>{{ service.suburb }}</td>
                  <td>{{ service.audience }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-pagination">
            <button class="button button--small" @click="changePage(serviceTableState, serviceTableView.page - 1, serviceTableView.totalPages)">Previous</button>
            <span>Page {{ serviceTableView.page }} of {{ serviceTableView.totalPages }}</span>
            <button class="button button--small" @click="changePage(serviceTableState, serviceTableView.page + 1, serviceTableView.totalPages)">Next</button>
          </div>
        </div>
      </section>

      <section v-else-if="currentView === 'map'" class="card page-card">
        <div class="card__header">
          <h2>Geo-location and route planning</h2>
          <p>
            Two map-based features are included: nearby service search within a radius and route
            summary with trip information to a selected service.
          </p>
        </div>

        <div class="map-tools">
          <label>
            Starting hub
            <select v-model="mapState.selectedSuburb">
              <option v-for="suburb in suburbCenters" :key="suburb.name" :value="suburb.name">{{ suburb.name }}</option>
            </select>
          </label>
          <label>
            Radius (km)
            <input v-model="mapState.radiusKm" type="range" min="3" max="20" />
          </label>
          <label>
            Destination service
            <select v-model="mapState.serviceId">
              <option v-for="service in services" :key="service.id" :value="service.id">{{ service.name }}</option>
            </select>
          </label>
          <label>
            Travel mode
            <select v-model="mapState.travelMode">
              <option value="car">Car</option>
              <option value="transit">Public transport</option>
              <option value="walk">Walk</option>
            </select>
          </label>
          <button class="button button--small" @click="useCurrentLocation">Use current location</button>
        </div>

        <div class="map-layout">
          <div ref="mapElement" class="map-canvas" aria-label="Service map"></div>

          <aside class="map-sidebar">
            <article class="map-summary">
              <h3>Trip information</h3>
              <p><strong>From:</strong> {{ routeSummary.suburb }}</p>
              <p><strong>To:</strong> {{ selectedMapService.name }}</p>
              <p><strong>Distance:</strong> {{ routeSummary.distanceKm }} km</p>
              <p><strong>Estimated time:</strong> {{ routeSummary.estimatedMinutes }} minutes</p>
            </article>

            <article class="map-summary">
              <h3>Nearby results</h3>
              <div class="nearby-list">
                <article v-for="service in nearbyServices" :key="service.id">
                  <strong>{{ service.name }}</strong>
                  <p>{{ service.suburb }} · {{ service.distanceKm.toFixed(1) }} km</p>
                </article>
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section v-else-if="currentView === 'bookings'" class="card page-card">
        <div class="card__header">
          <h2>Bookings and export tools</h2>
          <p>
            Appointment booking uses weekday and 48-hour rules, checks slot capacity, and exports
            records in both CSV and PDF-friendly formats.
          </p>
        </div>

        <div class="request-layout">
          <div class="request-form">
            <h3>New booking</h3>
            <label>
              Service
              <select v-model="bookingForm.serviceId">
                <option v-for="service in services" :key="service.id" :value="service.id">{{ service.name }}</option>
              </select>
            </label>
            <label>
              Date
              <input v-model="bookingForm.date" type="date" />
            </label>
            <label>
              Time
              <input v-model="bookingForm.time" type="time" />
            </label>
            <label>
              Mode
              <select v-model="bookingForm.mode">
                <option>Video consult</option>
                <option>Home visit</option>
                <option>Centre visit</option>
                <option>Van escort</option>
                <option>Advice session</option>
              </select>
            </label>
            <label>
              Seats
              <input v-model="bookingForm.seats" type="number" min="1" max="3" />
            </label>
            <label>
              Notes
              <textarea v-model="bookingForm.notes" rows="3" />
            </label>
            <button class="button button--primary" @click="createBooking">Create booking</button>
          </div>

          <div class="export-panel">
            <h3>Exports</h3>
            <p>Generate submission-friendly evidence for the app's data features.</p>
            <button class="button button--small" @click="exportBookingsSummary">Export bookings PDF</button>
            <button class="button button--small" @click="exportRequestsCsv">Export requests CSV</button>
          </div>
        </div>

        <div class="table-card">
          <div class="table-card__header">
            <h3>Booking table</h3>
            <p>{{ bookingTableView.totalRows }} matching rows</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><button class="sort-button" @click="sortTable(bookingTableState, 'residentName')">Resident</button></th>
                  <th><button class="sort-button" @click="sortTable(bookingTableState, 'serviceName')">Service</button></th>
                  <th><button class="sort-button" @click="sortTable(bookingTableState, 'date')">Date</button></th>
                  <th><button class="sort-button" @click="sortTable(bookingTableState, 'status')">Status</button></th>
                </tr>
                <tr>
                  <th><input v-model="bookingTableState.search.residentName" type="text" placeholder="Filter resident" @input="resetPage(bookingTableState)" /></th>
                  <th><input v-model="bookingTableState.search.serviceName" type="text" placeholder="Filter service" @input="resetPage(bookingTableState)" /></th>
                  <th><input v-model="bookingTableState.search.date" type="text" placeholder="Filter date" @input="resetPage(bookingTableState)" /></th>
                  <th><input v-model="bookingTableState.search.status" type="text" placeholder="Filter status" @input="resetPage(bookingTableState)" /></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="booking in bookingTableView.rows" :key="booking.id">
                  <td>{{ booking.residentName }}</td>
                  <td>{{ booking.serviceName }}</td>
                  <td>{{ booking.date }} {{ booking.time }}</td>
                  <td>{{ booking.status }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-pagination">
            <button class="button button--small" @click="changePage(bookingTableState, bookingTableView.page - 1, bookingTableView.totalPages)">Previous</button>
            <span>Page {{ bookingTableView.page }} of {{ bookingTableView.totalPages }}</span>
            <button class="button button--small" @click="changePage(bookingTableState, bookingTableView.page + 1, bookingTableView.totalPages)">Next</button>
          </div>
        </div>
      </section>

      <section v-else class="card page-card">
        <div class="card__header">
          <h2>Coordinator analytics and bulk email</h2>
          <p>
            This restricted area demonstrates role-based access, admin analytics, interactive charts,
            and a bulk email workflow with optional attachment validation.
          </p>
        </div>

        <div v-if="isCoordinator" class="dashboard-grid">
          <article class="dashboard-card">
            <h3>Bulk email composer</h3>
            <div class="request-form">
              <label>
                Audience
                <select v-model="emailForm.audience">
                  <option>Open requests</option>
                  <option>Confirmed bookings</option>
                  <option>All users</option>
                </select>
              </label>
              <label>
                Subject
                <input v-model="emailForm.subject" type="text" />
              </label>
              <label>
                Message
                <textarea v-model="emailForm.message" rows="4" />
              </label>
              <label>
                Attachment
                <input type="file" @change="handleAttachmentChange" />
              </label>
              <p class="muted">Recipients matched: {{ campaignRecipients.length }}</p>
              <button class="button button--primary" @click="sendCampaign">Send bulk email</button>
            </div>
          </article>

          <article class="dashboard-card">
            <h3>Interactive charts</h3>
            <div class="chart-card">
              <h4>Services by category</h4>
              <div class="chart-stack">
                <div v-for="item in chartByCategory" :key="item.label" class="chart-row">
                  <span>{{ item.label }}</span>
                  <div class="chart-bar">
                    <div class="chart-bar__fill" :style="{ width: `${item.value * 16}%` }"></div>
                  </div>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
            <div class="chart-card">
              <h4>Status pressure view</h4>
              <div class="chart-stack">
                <div v-for="item in chartByStatus" :key="item.label" class="chart-row">
                  <span>{{ item.label }}</span>
                  <div class="chart-bar chart-bar--warm">
                    <div class="chart-bar__fill chart-bar__fill--warm" :style="{ width: `${item.value * 10}%` }"></div>
                  </div>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </article>

          <article class="dashboard-card dashboard-card--wide">
            <div class="table-card__header">
              <h3>Operational summary</h3>
              <p>Bulk email records, triaged requests, and booking pressure in one place.</p>
            </div>
            <div class="summary-grid">
              <div class="summary-block">
                <strong>{{ bookings.filter((booking) => booking.status === 'Confirmed').length }}</strong>
                <span>Confirmed bookings</span>
              </div>
              <div class="summary-block">
                <strong>{{ serviceRequests.filter((request) => request.priority === 'High').length }}</strong>
                <span>High-priority requests</span>
              </div>
              <div class="summary-block">
                <strong>{{ emailLog.length }}</strong>
                <span>Emails sent</span>
              </div>
            </div>
            <div class="request-list">
              <article v-for="entry in emailLog.slice(0, 8)" :key="entry.id">
                <strong>{{ entry.subject }}</strong>
                <p>{{ entry.toName }} · {{ entry.toEmail }}</p>
                <small>{{ entry.sentAt }} · {{ entry.mode }}</small>
              </article>
            </div>
          </article>
        </div>

        <p v-else class="empty-state">
          Access denied. Sign in with the coordinator or admin demo account to open the restricted
          dashboard.
        </p>
      </section>
    </main>
  </div>
</template>
