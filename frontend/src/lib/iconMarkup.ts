import { ICON_PATHS, ICON_STROKE, ICON_VIEW_BOX, type IconName } from '@hazardnet/design-system';

export interface IconMarkupOptions {
  size?: number;
  color?: string;
  className?: string;
}

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const attributeName = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * Serialize a registered Lucide glyph for Leaflet's string-only HTML surfaces.
 * Path data still comes exclusively from the generated shared registry; this
 * helper does not define or draw any hand-authored SVG shapes.
 */
export function iconMarkup(name: IconName, { size = 16, color = 'currentColor', className = '' }: IconMarkupOptions = {}) {
  const glyph = ICON_PATHS[name]
    .map(([tag, attributes]) => {
      const props = Object.entries(attributes)
        .map(([key, value]) => `${attributeName(key)}="${escapeAttribute(String(value))}"`)
        .join(' ');
      return `<${tag}${props ? ` ${props}` : ''} />`;
    })
    .join('');
  const classes = className ? ` class="${escapeAttribute(className)}"` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg"${classes} width="${size}" height="${size}" viewBox="${ICON_VIEW_BOX}" fill="none" stroke="${escapeAttribute(color)}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${glyph}</svg>`;
}
