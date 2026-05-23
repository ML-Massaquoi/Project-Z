import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import axios from 'axios'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data?.detail) return String(data.detail)
    if (data?.message) return String(data.message)
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred. Please try again.'
}
