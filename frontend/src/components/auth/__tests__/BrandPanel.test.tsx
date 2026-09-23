import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import BrandPanel from '../BrandPanel'

jest.mock('framer-motion', () => ({
  ...jest.requireActual('framer-motion'),
  useReducedMotion: jest.fn(),
}))

const mount = (props: React.ComponentProps<typeof BrandPanel>) =>
  render(
    <MemoryRouter>
      <BrandPanel {...props} />
    </MemoryRouter>,
  )

const dot = (n: number) => screen.getByRole('tab', { name: `Highlight ${n} of 3` })

describe('BrandPanel — dynamic value carousel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useReducedMotion as unknown as jest.Mock).mockReturnValue(false)
  })

  it('renders the first login highlight and the count-up stats', async () => {
    mount({ mode: 'login' })
    expect(screen.getByText('Your district intelligence is waiting')).toBeInTheDocument()
    expect(screen.queryByText('Early warning, 15 days ahead')).not.toBeInTheDocument()
    // count-up stats settle on their final values
    await waitFor(() => expect(screen.getByText('64')).toBeInTheDocument(), { timeout: 2500 })
    await waitFor(() => expect(screen.getByText('2 tracks')).toBeInTheDocument(), { timeout: 2500 })
    expect(screen.getByText('Districts covered')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('rotates highlights automatically and cycles back to the first', async () => {
    mount({ mode: 'login', intervalMs: 120 })
    expect(dot(1)).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(dot(2)).toHaveAttribute('aria-selected', 'true'), { timeout: 2000 })
    await waitFor(() => expect(dot(3)).toHaveAttribute('aria-selected', 'true'), { timeout: 2000 })
    await waitFor(() => expect(dot(1)).toHaveAttribute('aria-selected', 'true'), { timeout: 2000 })
  })

  it('pauses rotation while hovering the carousel', async () => {
    mount({ mode: 'login', intervalMs: 150 })
    const carousel = screen.getByTestId('brand-carousel')
    fireEvent.mouseEnter(carousel)
    await new Promise((resolve) => setTimeout(resolve, 500))
    // paused: still on the first highlight despite the fast interval
    expect(dot(1)).toHaveAttribute('aria-selected', 'true')
    fireEvent.mouseLeave(carousel)
    await waitFor(() => expect(dot(2)).toHaveAttribute('aria-selected', 'true'), { timeout: 2000 })
  })

  it('jumps to a highlight via the dots (instant swap under reduced motion)', () => {
    ;(useReducedMotion as unknown as jest.Mock).mockReturnValue(true)
    mount({ mode: 'signup' })
    fireEvent.click(dot(2))
    expect(screen.getByText('Eight hazards, one picture')).toBeInTheDocument()
    fireEvent.click(dot(3))
    expect(screen.getByText('Open, transparent science')).toBeInTheDocument()
  })

  it('uses signup-specific highlights for /signup', () => {
    mount({ mode: 'signup' })
    expect(screen.getByText('Field-ready forecasts, in your hands')).toBeInTheDocument()
  })

  it('uses recovery-specific highlights for the password pages', () => {
    mount({ mode: 'recovery' })
    expect(screen.getByText('Let’s get you back in safely')).toBeInTheDocument()
  })

  it('does not rotate under reduced motion and shows final stats immediately', async () => {
    ;(useReducedMotion as unknown as jest.Mock).mockReturnValue(true)
    mount({ mode: 'login', intervalMs: 120 })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.getByText('Your district intelligence is waiting')).toBeInTheDocument()
    expect(screen.queryByText('Early warning, 15 days ahead')).not.toBeInTheDocument()
    expect(screen.getByText('64')).toBeInTheDocument()
    expect(screen.getByText('2 tracks')).toBeInTheDocument()
  })
})
