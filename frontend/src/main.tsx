import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { useAuthStore } from '@/stores/authStore'

// Rehydrate auth state from localStorage before first render
useAuthStore.getState().loadFromStorage()

createRoot(document.getElementById('root')!).render(<App />)
