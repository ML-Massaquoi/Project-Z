/**
 * Project Z - NotFound Page Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import NotFound from '@/pages/NotFound'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('NotFound Page', () => {
  it('renders 404 text', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )
    
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  it('renders page not found message', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )
    
    expect(screen.getByText('Page Not Found')).toBeInTheDocument()
  })

  it('renders go back button', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )
    
    expect(screen.getByText('Go Back')).toBeInTheDocument()
  })

  it('renders dashboard button', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('navigates back when go back is clicked', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )
    
    const goBackButton = screen.getByText('Go Back')
    goBackButton.click()
    
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})
