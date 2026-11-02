import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DistrictForecastCard, { DistrictWithRisk } from '../DistrictForecastCard'
import { setLanguage } from '../../../lib/i18n'

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
const onOpenDailyOutlook = jest.fn()

const mount = () =>
  render(
    <MemoryRouter>
      <DistrictForecastCard district={district} onClose={onClose} onOpenDailyOutlook={onOpenDailyOutlook} />
    </MemoryRouter>,
  )

describe('DistrictForecastCard (HDS selected panel)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setLanguage('en')
  })

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

  it('renders through the shared BottomSheet at the half stage', () => {
    mount()
    const sheet = screen.getByTestId('district-forecast-card')
    expect(sheet).toHaveAttribute('data-sheet-stage', 'half')
    expect(sheet.className).toContain('ap-sheet')
    expect(sheet.className).toContain('h-[62vh]')
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

  it('opens the farmer daily outlook with the district id, without claiming a modelled hazard', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /open the day-by-day district outlook/i }))
    expect(onOpenDailyOutlook).toHaveBeenCalledWith('kurigram')
  })

  it('closes via the close button', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /close district forecast/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
