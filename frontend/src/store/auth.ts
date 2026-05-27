import type { User } from '../types'
import api from '../api/client'

let _user: User | null = null
let _listeners: (() => void)[] = []

export function getUser(): User | null {
  return _user
}

export function subscribeAuth(fn: () => void) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(l => l !== fn) }
}

function notify() {
  _listeners.forEach(fn => fn())
}

export async function login(email: string, password: string): Promise<void> {
  const res = await api.post('/auth/login', { email, password })
  const { access_token, user } = res.data
  localStorage.setItem('token', access_token)
  localStorage.setItem('user', JSON.stringify(user))
  _user = user
  notify()
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  _user = null
  notify()
}

export function initAuth() {
  const stored = localStorage.getItem('user')
  if (stored) {
    try { _user = JSON.parse(stored) } catch { _user = null }
  }
}
