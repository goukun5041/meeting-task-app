import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { ref } from 'vue'

import { firebaseAuth } from './firebase'

export const authUser = ref<User | null>(null)
export const authLoading = ref(true)

const provider = new GoogleAuthProvider()
let authReadyPromise: Promise<User | null> | null = null

export function waitForAuthReady(): Promise<User | null> {
  if (authReadyPromise) return authReadyPromise

  authReadyPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user: User | null) => {
      authUser.value = user
      authLoading.value = false
      unsubscribe()
      resolve(user)
    })
  })

  onAuthStateChanged(firebaseAuth, (user: User | null) => {
    authUser.value = user
    authLoading.value = false
  })

  return authReadyPromise
}

export async function loginWithGoogle(): Promise<void> {
  await signInWithPopup(firebaseAuth, provider)
}

export async function logout(): Promise<void> {
  await signOut(firebaseAuth)
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string> {
  const user = authUser.value ?? (await waitForAuthReady())
  if (!user) throw new AuthRequiredError()
  return user.getIdToken(forceRefresh)
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication is required')
  }
}
