# Product

<!-- impeccable:product-schema 1 -->

This file overrides the repo-root `PRODUCT.md` for `apps/windows` only. The root record
declares `web` because that is what ships publicly; this workspace is a React Native for
Windows client, and inheriting `web` applied the wrong guidance to native code. `DESIGN.md`
still inherits from the root — the visual system is shared.

## Platform

adaptive

## Stack

React Native 0.74 with React Native for Windows 0.74, TypeScript, a committed Visual Studio
solution under `windows/` (UWP/WinUI, C++ host), Metro bundling with Hermes bytecode
embedded in the release build. Entry points `App.windows.tsx` / `index.windows.js`.

## Users

The desk audiences of the root record, on a managed Windows machine:

1. **Agricultural extension workers and union parishad officials** — producing something
   they can hand out or project in a room.
2. **Researchers and academic reviewers** — reading the scorecard, provenance and
   limitations on a large screen.

The field audience of the root record is served by `apps/mobile`, not by this client.

## Product Purpose

The same published outlook at desktop size for people who need to print it, show it, or
check it against the source: a wide overview of the districts, the current advisories, and
the run status.

## Positioning

A desk companion to the site for the two readers who need a window rather than a tab — and,
today, a preserved client rather than a shipping one. It carries no product truth of its
own.

## Operating Context

A Windows 10/11 desktop, a real keyboard and pointer, a large display, and often a printer.
Connectivity is assumed present; the app is not offline-first. Text may be scaled by the
system, and the window may be resized to anything from a narrow snap pane to full screen.

## Capabilities and Constraints

- **Hard constraint:** the MSIX pipeline is parked at
  `.github/workflow-templates/hazardnet-windows-msix-release.yml`. Nothing publishes an
  installer on push; the previous CI signing certificate was self-signed, so an installed
  build prompts for approval.
- The Visual Studio solution is committed; no compiled binaries are.
- Pointer and keyboard affordances are expected, not optional: focus rings, hover, escape,
  and window resize are part of the surface.

## Brand Commitments

Inherits `DESIGN.md` (Cupertino Precision). Windows conventions own window chrome, menus,
keyboard navigation and focus visuals; the design system owns type, colour and density
inside it.

## Evidence on Hand

- `docs/APP_RELEASES.md` — the parked pipeline and its restore checklist.
- `App.windows.tsx`, `src/components/WindowsDesktopOverview.tsx`, `windows/` — the surface as
  built.
- The shared artifact contracts in `/data`, identical to the site's.

## Product Principles

1. The same artifact, at desk scale — no second computation.
2. Print and projection are first-class outputs, not afterthoughts.
3. Keyboard reachability is not a preference.
4. When the client cannot read the artifact, it says so in words.

## Accessibility & Inclusion

System font scaling without clipping, visible focus at every stop, contrast measured
against the real surfaces in both themes, and windows that reflow to a snap pane rather than
scroll horizontally.
