import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HazardNetBrand } from './HazardNetLogo';
import MaterialIcon from './MaterialIcon';

/**
 * The site footer.
 *
 * Navigation is data, not 150 lines of copy-pasted <li>s, and every label is one or two plain words (the same rule as
 * the header and the menu drawer — see lib/navigation.ts). Paths are unchanged.
 *
 * Two honesty fixes ride along:
 *   · the old "Feedback" modal printed "Feedback Submitted! Your report helps improve our classification algorithms"
 *     after a `setTimeout` — nothing was ever sent. Feedback now goes to /contact, which builds a prefilled GitHub issue
 *     or e-mail and claims nothing until the visitor has actually opened one;
 *   · the one sentence that matters most on an early-warning site — it is not an official warning service, and who to
 *     call — is in every footer, not only on /alerts.
 * The back-to-top button sits bottom-LEFT so it can never cover the chat button.
 */

interface FooterLink {
  label: string;
  to?: string;
  href?: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Live map', to: '/live' },
      { label: 'Analytics', to: '/analytics' },
      { label: 'Lookup', to: '/upload' },
      { label: 'Regions', to: '/use-cases' },
    ],
  },
  {
    title: 'Use cases',
    links: [
      { label: 'Haor floods', to: '/use-cases?case=haor' },
      { label: 'Cyclones', to: '/use-cases?case=cyclone' },
      { label: 'Drought', to: '/use-cases?case=barind' },
      { label: 'Cold waves', to: '/use-cases?case=coldwave' },
    ],
  },
  {
    title: 'Downloads',
    links: [
      { label: 'Android', to: '/download?platform=android' },
      { label: 'Windows', to: '/download?platform=windows' },
      { label: 'Linux', to: '/download?platform=linux' },
      { label: 'Python', to: '/download?platform=python' },
      { label: 'JavaScript', to: '/download?platform=npm' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Docs', to: '/docs' },
      { label: 'Status', to: '/status' },
      { label: 'Blog', to: '/blogs' },
      // The hazard-by-hazard methodology and the per-district outlooks are crawlable reference pages.
      { label: 'Hazards', to: '/hazards' },
      { label: 'Districts', to: '/districts' },
      { label: 'About', to: '/about' },
      { label: 'Contact', to: '/contact' },
      { label: 'Feedback', to: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', to: '/terms' },
      { label: 'Privacy', to: '/privacy' },
      { label: 'License', href: 'https://github.com/myself-aas/HazardNet/blob/main/LICENSE' },
    ],
  },
];

// The 44px box is the anchor itself, not an overlay. The old `.touch-target-link::before`
// centred a 44x44 pseudo-element on every footer link, and in this wrapped multi-column
// layout adjacent overlays overlapped: tapping "Privacy" could land on "Terms". A real box
// cannot overlap its neighbour, so the floor is met by geometry rather than by an invisible
// layer on top of other targets.
const linkClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center text-ap-caption font-medium text-carbon-80 no-underline transition-colors hover:text-nasa-blue-shade hover:underline';

export const Footer: React.FC = () => {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <footer
      className="relative z-10 border-t border-carbon-20 bg-carbon-05 px-4 py-14 text-carbon-80 md:px-8"
      aria-label="Site footer"
    >
      <div className="mx-auto max-w-7xl space-y-10">
        {/* Brand + actions */}
        <div className="flex flex-col gap-6 border-b border-carbon-20 pb-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-3">
            <HazardNetBrand size="lg" />
            <p className="text-ap-caption leading-relaxed text-carbon-60">
              A multi-hazard forecasting platform for 7- and 15-day multi-hazard outlooks across Bangladesh, with
              dual-track severity and agronomic context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/download"
              className="inline-flex min-h-[44px] items-center rounded-control bg-nasa-blue px-5 text-ap-caption font-semibold text-white no-underline transition-colors hover:bg-nasa-blue-shade"
            >
              Get the apps
            </Link>
            <a
              href="https://github.com/myself-aas/HazardNet"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-control border border-carbon-30 bg-white px-5 text-ap-caption font-semibold text-carbon-90 no-underline transition-colors hover:bg-carbon-10"
            >
              GitHub
            </a>
            <Link
              to="/contact"
              className="inline-flex min-h-[44px] items-center rounded-control border border-carbon-30 bg-white px-5 text-ap-caption font-semibold text-carbon-90 no-underline transition-colors hover:bg-carbon-10"
              title="Report a false alarm, a missed hazard or an idea"
            >
              Feedback
            </Link>
          </div>
        </div>

        {/* Links */}
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-ap-caption font-bold text-carbon-90">{column.title}</h2>
              <ul className="mt-1.5">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    {link.to ? (
                      <Link to={link.to} className={linkClass}>
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* The sentence that matters most. */}
        <p className="rounded-2xl border border-carbon-20 bg-white p-4 text-ap-caption leading-relaxed text-carbon-70">
          <strong className="text-carbon-90">HazardNet is a research platform, not an official warning service.</strong>{' '}
          In an emergency call{' '}
          <a href="tel:999" className="font-bold underline">
            999
          </a>
          .
        </p>

        {/* Baseline */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-carbon-20 pt-6 text-center">
          <span className="text-ap-caption font-semibold text-carbon-80">© {new Date().getFullYear()} HazardNet</span>
          <Link to="/terms" className={linkClass}>
            Terms
          </Link>
          <Link to="/privacy" className={linkClass}>
            Privacy
          </Link>
          <Link to="/docs" className={linkClass}>
            Docs
          </Link>
        </div>
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 left-4 z-[var(--z-sticky)] flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-carbon-20 bg-white text-carbon-80 shadow-md transition-colors hover:bg-carbon-05 sm:left-6"
          title="Back to top"
          aria-label="Scroll to top"
        >
          <MaterialIcon name="expand_less" size={20} />
        </button>
      )}
    </footer>
  );
};

export default Footer;
