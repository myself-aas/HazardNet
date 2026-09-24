import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DistrictForecastCard, { DistrictWithRisk } from '../DistrictForecastCard'

jest.mock('../../ui/expand-map', () => ({
  LocationMap: () => <div data-testid="location-map-tile" />,
}))

const district: DistrictWithRisk = {
  id: 'kurigram',
  name: 'Kurigram',
  division: 'Rangpur',
  lat: 25.8058,
  lng: 89.6361,
  risk: 'High',
  severity: 0.88,
  hazardType: 'Monsoon Flood',
  mainCrop: 'Aman Rice & Jute',
  elevationMeters: 28,
} as DistrictWithRisk

const onClose = jest.fn()
const onOpenAnalytics = jest.fn()

const mount = () =>
  render(
    <MemoryRouter>
      <DistrictForecastCard district={district} onClose={onClose} onOpenAnalytics={onOpenAnalytics} />
    </MemoryRouter>,
  )

describe('DistrictForecastCard (HDS selected panel)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the district forecast with hazard, severity and compact facts', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /kurigram district forecast/i })).toBeInTheDocument()
    expect(screen.getByText('Monsoon Flood')).toBeInTheDocument()
    expect(screen.getByText('Severity score 0.88')).toBeInTheDocument()
    expect(screen.getByText('High Risk')).toBeInTheDocument()
    expect(screen.getByTitle(/Main crop: Aman Rice & Jute/i)).toBeInTheDocument()
    expect(screen.getByText(/28m MSL/i)).toBeInTheDocument()
    expect(screen.getByText(/25\.81°N, 89\.64°E/)).toBeInTheDocument()
    expect(screen.queryByTestId('location-map-tile')).not.toBeInTheDocument()
  })

  it('expands the collapsible location map on demand', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /location map/i }))
    expect(screen.getByTestId('location-map-tile')).toBeInTheDocument()
  })

  it('is an in-flow opaque card, not a glass overlay covering the map', () => {
    const { container } = mount()
    const card = container.firstElementChild as HTMLElement
    expect(card.className).not.toContain('absolute')
    expect(card.className).not.toContain('top-20')
    expect(card.className).not.toContain('backdrop-blur')
    expect(card.className).toContain('bg-white')
    expect(card.className).toContain('border-carbon-20')
  })

  it('uses a 44px close control', () => {
    mount()
    const close = screen.getByRole('button', { name: /close district forecast/i })
    expect(close.className).toContain('tap-target')
  })

  it('exposes severity via an accessible meter', () => {
    mount()
    const meter = screen.getByRole('meter', { name: /kurigram hazard severity/i })
    expect(meter).toHaveAttribute('aria-valuenow', '88')
  })

  it('opens detailed analytics with the district id', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /view detailed disaster analytics/i }))
    expect(onOpenAnalytics).toHaveBeenCalledWith('kurigram')
  })

  it('closes via the close button', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /close district forecast/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
