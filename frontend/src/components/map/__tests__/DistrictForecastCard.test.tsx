import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('renders the district forecast with hazard, severity and compact facts', () => {
    mount()
    expect(screen.getByRole('dialog', { name: /kurigram district forecast/i })).toBeInTheDocument()
    expect(screen.getByText('Monsoon Flood')).toBeInTheDocument()
    expect(screen.getByText('88% Severity')).toBeInTheDocument()
    expect(screen.getByText('High Risk')).toBeInTheDocument()
    expect(screen.getByTitle(/Main crop: Aman Rice & Jute/i)).toBeInTheDocument()
    expect(screen.getByText(/28m MSL/i)).toBeInTheDocument()
    expect(screen.getByText(/25\.81°N, 89\.64°E/)).toBeInTheDocument()
    // location map starts collapsed in the compact edition
    expect(screen.queryByTestId('location-map-tile')).not.toBeInTheDocument()
  })

  it('expands the collapsible location map on demand', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /location map/i }))
    expect(screen.getByTestId('location-map-tile')).toBeInTheDocument()
  })

  it('docks below the top navbar and is height-capped above the map bottom', () => {
    const { container } = mount()
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('top-20')
    expect(card.className).toContain('sm:top-24')
    expect(card.className).not.toContain('top-6')
    // CSS fallback caps (JS-measured inline maxHeight is the primary guard)
    expect(card.className).toContain('max-h-[calc(100%_-_5.5rem)]')
    expect(card.className).toContain('sm:max-h-[calc(100%_-_7rem)]')
  })

  it('caps its height to the measured map viewport via inline maxHeight', async () => {
    const orig = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const el = this as HTMLElement
      if (el.getAttribute?.('data-testid') === 'hud') {
        return { top: 0, bottom: 800, height: 800, width: 800, left: 0, right: 800, x: 0, y: 0 } as DOMRect
      }
      if (el.getAttribute?.('role') === 'dialog') {
        return { top: 96, bottom: 400, height: 304, width: 340, left: 0, right: 340, x: 0, y: 96 } as DOMRect
      }
      return orig.call(this)
    }
    try {
      const { container } = render(
        <div data-testid="hud">
          <MemoryRouter>
            <DistrictForecastCard district={district} onClose={onClose} onOpenAnalytics={onOpenAnalytics} />
          </MemoryRouter>
        </div>,
      )
      const card = container.querySelector('[role="dialog"]') as HTMLElement
      // 800 (map bottom) - 96 (card top, below navbar) - 12 (breathing room)
      await waitFor(() => expect(card.style.maxHeight).toBe('692px'))
    } finally {
      Element.prototype.getBoundingClientRect = orig
    }
  })

  it('uses the compact width and a translucent glass background', () => {
    const { container } = mount()
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('sm:max-w-[440px]')
    const glass = card.firstElementChild as HTMLElement
    expect(glass.className).toContain('bg-white/85')
    expect(glass.className).toContain('backdrop-blur-md')
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
