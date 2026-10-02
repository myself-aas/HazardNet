/**
 * The menu icon: two rounded bars — a long one over a short one — and a node, the same bead that rides the logo's loop.
 * Closed, it reads as "a list, with a signal on it"; open, the bars cross into a ✕ and the node slips away.
 *
 * It replaces the three-equal-lines hamburger, which says "menu" the same way on every site. All motion is
 * `transform` and `opacity` on three shapes (240ms, strong ease-out — see styles/brand.css), and it is decorative:
 * the button that holds it carries the accessible name. `currentColor` bars, so it follows the header's text colour
 * on light and on the dark hero alike.
 */
export const MenuToggleIcon: React.FC<{ open?: boolean; size?: number; className?: string }> = ({
  open = false,
  size = 24,
  className = '',
}) => (
  <svg
    className={`hn-menu-icon ${className}`.trim()}
    data-open={open ? 'true' : 'false'}
    viewBox="0 0 24 24"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
  >
    <rect className="hn-menu-icon__bar hn-menu-icon__bar--a" x="3.5" y="6.75" width="17" height="2.5" rx="1.25" />
    <rect className="hn-menu-icon__bar hn-menu-icon__bar--b" x="9" y="14.75" width="11.5" height="2.5" rx="1.25" />
    <circle className="hn-menu-icon__node" cx="5.5" cy="16" r="1.9" />
  </svg>
);

export default MenuToggleIcon;
