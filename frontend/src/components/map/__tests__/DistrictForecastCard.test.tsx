import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DistrictForecastCard from '../DistrictForecastCard'
import { DistrictWithRisk } from '../DistrictForecastCard'

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

describe('DistrictForecastCard (redesigned district popup)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the district forecast with hazard, severity and facts', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /kurigram district forecast/i })).toBeInTheDocument()
    expect(screen.getByText('Kurigram District')).toBeInTheDocument()
    expect(screen.getByText('Monsoon Flood')).toBeInTheDocument()
    expect(screen.getByText('88% Severity')).toBeInTheDocument()
    expect(screen.getByText('High Risk')).toBeInTheDocument()
    expect(screen.getByText('Aman Rice & Jute')).toBeInTheDocument()
    expect(screen.getByText(/28m MSL/i)).toBeInTheDocument()
    expect(screen.getByText(/25\.81°N, 89\.64°E/)).toBeInTheDocument()
    expect(screen.getByTestId('location-map-tile')).toBeInTheDocument()
  })

  it('docks below the top navbar (never cropped behind it)', () => {
    const { container } = mount()
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('top-20')
    expect(card.className).toContain('sm:top-24')
    expect(card.className).not.toContain('top-6')
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
