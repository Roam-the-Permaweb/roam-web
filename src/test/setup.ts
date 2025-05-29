import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock fetch globally
global.fetch = vi.fn()

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    search: '',
    pathname: '/',
    hash: '',
    origin: 'https://roam.ar.io',
    hostname: 'roam.ar.io',
    protocol: 'https:',
    port: '',
    host: 'roam.ar.io'
  },
  writable: true,
  configurable: true
})

// Mock window.history
Object.defineProperty(window, 'history', {
  value: {
    replaceState: vi.fn(),
    pushState: vi.fn()
  },
  writable: true
})

// Mock navigator.share and navigator.clipboard
Object.defineProperty(navigator, 'share', {
  value: vi.fn(),
  writable: true
})

Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn()
  },
  writable: true
})

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})