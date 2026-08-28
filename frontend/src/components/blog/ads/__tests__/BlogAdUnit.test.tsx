import { render, screen } from '@testing-library/react'
import { AdSenseScript, BlogAdUnit } from '../BlogAdUnit'
import * as adsense from '../../../../lib/adsense'

jest.mock('../../../../lib/adsense', () => ({
  ADSENSE_CLIENT: 'ca-pub-1234567890123456',
  ADSENSE_SLOT_BLOG_INDEX: 'slot-index',
  ADSENSE_SLOT_ARTICLE_INLINE: 'slot-inline',
  ADSENSE_SLOT_ARTICLE_FOOTER: 'slot-footer',
  isAdSenseConfigured: true,
  isAdSenseDevMode: false,
  requestAdFill: jest.fn(),
  injectAdSenseScript: jest.fn(() => () => undefined),
}))

const requestAdFill = adsense.requestAdFill as jest.Mock

describe('BlogAdUnit (AdSense, blog pages only)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    document.head.innerHTML = ''
  })

  it('renders a configured ad ins with the client and slot ids', () => {
    render(<BlogAdUnit slot="slot-inline" format="fluid" inArticle />)
    const ins = document.querySelector('ins.adsbygoogle')
    expect(ins).not.toBeNull()
    expect(ins?.getAttribute('data-ad-client')).toBe('ca-pub-1234567890123456')
    expect(ins?.getAttribute('data-ad-slot')).toBe('slot-inline')
    expect(ins?.getAttribute('data-ad-layout')).toBe('in-article')
    expect(ins?.getAttribute('data-full-width-responsive')).toBe('true')
    expect(requestAdFill).toHaveBeenCalledTimes(1)
  })

  it('shows a dev placeholder and does not request a fill when unconfigured in dev mode', () => {
    render(<BlogAdUnit slot="slot-index" configured={false} devMode />)
    expect(screen.getByTestId('blog-ad-placeholder')).toBeInTheDocument()
    expect(document.querySelector('ins.adsbygoogle')).toBeNull()
    expect(requestAdFill).not.toHaveBeenCalled()
  })

  it('renders nothing in production when unconfigured', () => {
    const { container } = render(<BlogAdUnit slot="slot-index" configured={false} devMode={false} />)
    expect(container.querySelector('[data-testid="blog-ad-unit"]')).toBeNull()
  })

  it('requests script injection via AdSenseScript on mount (and re-injects per page visit)', () => {
    const inject = adsense.injectAdSenseScript as jest.Mock
    const { unmount } = render(<AdSenseScript />)
    expect(inject).toHaveBeenCalledTimes(1)
    unmount()
    render(<AdSenseScript />)
    // The real implementation removes its <script> in the returned cleanup, so
    // a fresh blog visit legitimately injects it again.
    expect(inject).toHaveBeenCalledTimes(2)
  })
})
