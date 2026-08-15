import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean)
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
const auth = firebaseApp ? getAuth(firebaseApp) : null
const provider = firebaseApp ? new GoogleAuthProvider() : null

function buildFallbackUser(payload = {}) {
  return {
    uid: `demo-${Date.now()}`,
    email: payload.email || 'demo.external@elderlink.app',
    displayName: payload.fullName || 'Demo External User',
    providerId: payload.providerId || 'demo-firebase',
  }
}

export function isFirebaseConfigured() {
  return hasFirebaseConfig
}

export async function registerWithExternalAuth({ fullName, email, password }) {
  if (!auth) {
    return buildFallbackUser({ fullName, email })
  }

  const result = await createUserWithEmailAndPassword(auth, email, password)
  if (fullName) {
    await updateProfile(result.user, { displayName: fullName })
  }
  return result.user
}

export async function loginWithExternalAuth({ email, password }) {
  if (!auth) {
    return buildFallbackUser({ email })
  }

  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function loginWithGooglePopup() {
  if (!auth || !provider) {
    return buildFallbackUser({
      email: 'google.demo@elderlink.app',
      fullName: 'Demo Google User',
      providerId: 'demo-google',
    })
  }

  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function logoutExternalAuth() {
  if (!auth) {
    return true
  }

  await signOut(auth)
  return true
}
