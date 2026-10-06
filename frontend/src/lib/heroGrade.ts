/**
 * The hero's grade — one file, four values, two runtimes.
 *
 * The hero photograph is dark on purpose, but it is not *dependably* dark: the carousel ships four
 * frames, two of which are bright haze (monsoon storm, flooded fields), and the copy sits on top
 * of whatever is showing. What makes white type readable is not the photograph, it is this stack:
 * one blend-mode wash that keeps the scene blue, one exposure curve that pulls the frame down
 * towards the foot of the hero, and one vignette that darkens the edges past the middle. The three
 * compose in that order, and nothing else in the hero is allowed to invent an overlay.
 *
 * **Why a module and not the stylesheet.** Both heroes paint these same four values: the page
 * (`components/HeroCinematicBackground.tsx`) and the 16:9 export
 * (`remotion/compositions/HeroComposition.tsx`, rendered to MP4 by the Remotion bundle, which
 * does not load `index.css`). Until 2026-10-06 each of them carried its own copy of the strings —
 * so the export could describe a grade the page no longer had. There is one copy now.
 *
 * **Deeper as of 2026-10-06.** The stops below are the audited ones, darkened a half-stop: the
 * foot of the exposure curve goes 0.68 → 0.80 and 0.92 → 0.96, the vignette's two stops go
 * 0.55/0.95 → 0.64/0.97, and the wash goes 0.20 → 0.26. This is the direction audit H-P1-4
 * (`docs/audits/2026-10-03-landing-live-hero-audit.md`) measured on the copy panel that used to
 * sit here: at 12px, `text-white/75` over a `#e0e0e0` photograph pixel was 2.45:1 — a
 * safety-statement failure, not a taste call. The panel is gone; the grade is what replaces it,
 * and the copy is anchored to the band it darkens (see the hero block in `pages/FrontDoor.tsx`).
 *
 * `components/__tests__/HeroCinematicBackground.test.tsx` pins the floor: no stop in this file may
 * come out lighter than the values that were audited, and the exposure curve must stay monotonic
 * towards its foot. These are
 * media colours, in the same category as the photographs — see the exemption note in
 * `__tests__/colourDiscipline.test.js`. They deliberately do not come from `apple.css`.
 */

export interface HeroGrade {
  /** Layer 1 — the brand-blue orbital glow painted behind the photograph. */
  meshGlow: string;
  /** Layer 3a — the `soft-light` wash that keeps a dark hero blue rather than grey. */
  gradeWash: string;
  /** Layer 3b — the exposure curve. The copy sits in its lower band. */
  exposure: string;
  /** Layer 3c — the elliptical vignette, painted over the exposure curve. */
  vignette: string;
}

export const HERO_GRADE: HeroGrade = {
  meshGlow:
    'radial-gradient(circle, rgba(28, 103, 227, 0.30) 0%, rgba(15, 58, 122, 0.12) 50%, rgba(15, 58, 122, 0) 70%)',
  gradeWash: 'rgba(15, 58, 122, 0.26)',
  exposure:
    'linear-gradient(180deg, rgba(3, 5, 11, 0.42) 0%, rgba(5, 7, 14, 0.26) 30%, rgba(5, 7, 14, 0.80) 70%, rgba(5, 7, 14, 0.96) 100%)',
  vignette:
    'radial-gradient(ellipse at center, rgba(5, 7, 14, 0) 34%, rgba(5, 7, 14, 0.64) 74%, rgba(5, 7, 14, 0.97) 100%)',
};

export default HERO_GRADE;
