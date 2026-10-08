# HazardNet design-system implementation guide

> **Current system:** Cupertino Precision (DESIGN.md, 2026-10-08). It replaces the earlier Apple system; sections that name SF Pro or the old type scale are historical. This file is the short contributor guide, not a second token specification. The specification is [`DESIGN.md`](../DESIGN.md) at the repository root (installed with `npx getdesign@latest add apple`, and not edited by us); HazardNet's four documented extensions are in [`docs/design-system/APPLE.md`](../docs/design-system/APPLE.md); the tokens are `packages/design-system/src/apple.ts`.
>
> **Latest audit:** [`docs/audits/2026-10-05-frontend-design-system-audit.md`](../docs/audits/2026-10-05-frontend-design-system-audit.md).

HazardNet is an existing safety-critical product with an editorial front door, a dense live console, alert workflows and an Expo app. Treat it as product UI, not as a marketing-page template. Keep existing data, routes, state handling and offline behavior intact when changing presentation.

## Non-negotiable design rules

1. **Keep severity unambiguous.** Severity is a documented data layer (`APPLE_SEVERITY`), separate from chrome; hazard *type* is a second one (`APPLE_HAZARD`). Apple's single-accent rule governs chrome only — links, buttons, nav are Action Blue and nothing else is. Show alert level with colour, icon or shape, **and a word**; never colour alone.
2. **Use semantic roles.** Consume the published tokens instead of adding one-off hex, shadow, radius, typography or motion values. `__tests__/colourDiscipline.test.js` fails the build on a colour the system does not publish — if you need a value, add it to the system.
3. **Keep the two density tracks.** Identical tokens everywhere; only the spacing step differs. Editorial surfaces take the full 80px tile rhythm, the `/live` console takes a tighter step off the same scale. Do not impose landing-page sparsity on maps, tables or alert lists.
4. **Design for phones and future native screens.** Prefer stacked/card table fallbacks, responsive reflow, 44pt iOS / 48dp Android targets, safe-area-aware layouts, native system fonts and no hover-only affordance. A web hit area and a native hit area are not interchangeable.
5. **Accessibility is part of the component contract.** Respect Dynamic Type and reduced motion, preserve visible focus, meet WCAG AA for small text, give icon-only controls accessible names, and keep status text readable in light, dark, OLED and increased-contrast modes.
6. **Preserve functionality and honest states.** Loading, stale, offline, permission, empty, partial and error states are product behavior. Do not replace unavailable measurements with zeroes or remove existing routes and controls as a visual shortcut.

## Canonical implementation

| Concern | Source of truth |
|---|---|
| The specification itself | `DESIGN.md` (repo root) — do not edit |
| Shared tokens, type scale, severity, hazard identity, radii, motion | `packages/design-system/src/apple.ts` |
| HazardNet's four documented extensions | `docs/design-system/APPLE.md` |
| Web primitives and motion | `frontend/src/components/apple/` |
| Web light/dark roles and component styles | `frontend/src/styles/apple.css` (one stylesheet, both themes) |
| App-wide web resets | `frontend/src/index.css` — imports exactly `apple.css` + `hero-media.css` |
| Native theme and native-unit adapter | `apps/mobile/src/theme/theme.ts`, `apps/mobile/src/theme/nativeTokens.ts` |
| Shared icon family | `data/design/icon-registry.json`, generated `packages/design-system/src/icons.ts`, and `apps/mobile/src/components/Icon.tsx` |

Use the web primitives or the named `.ap-*` CSS roles for new work. Native screens should use `Text`, `Button`, `Card`, `Chip`, `Icon` and theme colors from `useTheme()`. Do not import a different icon package or render emoji/text characters as interface icons. The web's remaining `MaterialIcon` imports are a frozen migration backlog; do not add new ones.

## Platform guidance

### Web

- Use system UI typography for Latin, the bundled Noto Sans Bengali face for Bengali, and the platform mono stack only for data.
- Use the existing Tailwind semantic aliases and the `.ap-*` roles. Keep print, reduced-motion, screen-reader and low-bandwidth behavior intact.
- The public front door and dense `/live` console are different surfaces. The former can use editorial spacing; the latter prioritizes scan speed, map/table parity and persistent state labels.
- Re-check responsive layout at narrow phone widths and tablet widths; do not assume desktop hover, viewport height or a mouse.

### Native (Expo / React Native)

- `ThemeProvider` follows system appearance by default and supports user-selected light, dark and OLED modes plus increased contrast. It maps native colours onto `appleNative.ts` instead of maintaining an unrelated palette, and `nativeAppleParity` fails if the two drift.
- Use the native system font family rather than bundling proprietary SF Pro. Body text follows the system's 17pt role; named sizes translate to native points/dp while Dynamic Type remains uncapped. The app-level Large Text and Bold Text preferences are additive.
- Buttons maintain at least 48dp height, can grow with text, and use pill geometry on the consumer shell. Compact chips may be visually shorter only where their expanded hit region preserves the target.
- Include bottom safe-area insets in native tab/navigation geometry. Use the five implemented destinations: Today, Alerts, Map, Saved and More.
- Keep map data colors stable, but derive application chrome, text, focus, controls and severity presentation from theme roles. Do not put a blurred glass layer over the native map.
- Screen-level localization, system text scaling, offline maps and native-reader behavior must be tested on device before calling the port complete. Web parity is a design constraint, not proof of native correctness.

## Apple reference: how to apply it here

The root `DESIGN.md` is the installed specification, not an official Apple publication. Apply its clarity, platform typography, restrained chrome, clear hierarchy and comfortable targets. Do not copy Apple's proprietary artwork or type files. HazardNet keeps hazard semantics, explicit freshness/provenance and accessible alert colors even when they differ from a generic commerce interface. The appropriate outcome is this system implemented consistently.

## Change checklist

Before changing a shared primitive or token:

1. Find its web and native call sites and all states (including dark/OLED, large text, Bengali, offline and error).
2. Reuse or extend a semantic role; record intentional platform differences rather than hiding them in copied constants.
3. Keep safety status distinguishable by text and shape as well as color; calculate foreground/background contrast for the rendered pairing.
4. Add or update a regression test in `__tests__/` or `apps/mobile/__tests__/`.
5. Run relevant gates: `npm run check:design:source`, `npm run check:tokens`, `npm run check:brand`, `npm run check:fonts`, `npm run check:prose`, and the affected Jest suites. Build the Vite bundle when CSS cascade or responsive behavior changes.

See the latest audit report for measured findings, fixes, open risks and the full-web/mobile review scope.
