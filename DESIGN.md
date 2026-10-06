# ETH Pulse design

## Overview

ETH Pulse is a compact, read-only Ethereum dashboard for people checking the current network. Its visual direction is near-black, off-white, and one amber accent. A quiet header leads to three large readings, followed by a dense 12-row table. This is one page; smaller screens use normal vertical scrolling. There are no photographic assets, charts, overlays, theme switches, or additional pages.

The source of truth is `src/styles.css`, with page markup and the local `Icon` pattern in `src/App.tsx`. Important data is more prominent than metadata. Space groups sections; thin borders separate related metrics and table rows. Amber emphasizes the wallet action, the latest block, focus, and small brand/status details. Text and labels carry status independently of color.

## Colors

All components consume semantic CSS properties, which refer to a small hex palette in `src/styles.css:15`.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#101110` | Page and ordinary table rows |
| `--color-surface` | `#171817` | Metrics, neutral buttons, messages, table footer |
| `--color-surface-raised` | `#1b1d1b` | Table header |
| `--color-hover` | `#242624` | Neutral hover and count badge |
| `--color-border` | `#30332f` | Structural outlines and panel separators |
| `--color-divider` | `#242624` | Table row separators and gas tracks |
| `--color-text` | `#f1f0e9` | Primary text and numeric readings |
| `--color-text-muted` | `#a2a79d` | Metadata, units, timestamps |
| `--color-icon`, `--color-meter` | `#757b72` | Decorative icons and gas bars |
| `--color-accent`, `--color-focus` | `#eab66b` | Primary action, latest-block text, focus ring |
| `--color-accent-hover` | `#f3c68a` | Wallet action hover |
| `--color-accent-subtle` | `#242018` | Latest-block row |
| `--color-on-accent` | `#101110` | Text on the amber button and selected text |

Measured rendered WCAG contrast includes primary text/page **16.56:1**, muted text/metric surface **7.25:1**, amber button text/fill **10.27:1**, and muted timestamp/latest-row surface **6.60:1**. The full measured pairs are in `artifacts/contrast.json`. Border and decorative-track colors are not used for body text. Forced colors preserve system `Highlight` focus and visible control borders. There is only one designed theme.

## Typography

Two locally bundled variable WOFF2 fonts, declared at `src/styles.css:1`:

- `--font-sans`: `Geist Variable`, `system-ui`, `sans-serif` for interface text.
- `--font-mono`: `Geist Mono Variable`, `ui-monospace`, `monospace` for values, block numbers, timestamps, and the clock.

The Fontsource packages supply Latin normal faces with weights 100–900; the interface requests 400, 500, and 600. No italics or synthetic styles are used. Font loading was confirmed in Chromium; source uses `font-display: swap` and `font-synthesis: none`.

| Role | Implemented size and treatment |
| --- | --- |
| Brand `h1` | 22px, 600, line-height 1.2, tracking −0.7px |
| Overview `h2` | 22px, 500, line-height 1.25, tracking −0.65px |
| Table section `h2` | 17px, 500; 16px on mobile |
| Metric labels | 12px, 500, uppercase through CSS, tracking 1.15px |
| Metric values | Desktop `clamp(1.875rem, 3.1vw, 2.625rem)`; 32px at ≤65rem, 26px at ≤49rem, 38px at ≤38rem; 400, line-height 1.3 |
| Standard UI | `--text-body` 14px, `--text-sm` 13px, `--text-xs` 12px |
| Table numbers | 13px desktop, 12px mobile; tabular monospace |
| Dense metadata | 10–11px for the eyebrow, tiny badges, table footer and legal footer; non-primary content |

Body paragraphs have line-height 1.5 and status messages 1.6. Headings use balanced wrapping. Useful text stays selectable. Changing numbers use `tabular-nums`. Wallet addresses wrap in full; values are never silently ellipsized. A 200% root-font enlargement was rendered and checked separately from narrow-screen reflow; this was not native browser zoom.

## Layout

`.app-shell` has a 1264px maximum outer width and 48px side padding on large screens. Shared spacing variables are 4, 8, 12, 16, 24, and 32px. The header has a 92px minimum height. Main content starts 30px below it, and the block section is separated from metrics by 28px.

`.metrics` uses three equal `min-width: 0` columns with a single enclosing surface. The table uses fixed column proportions of 32/24/20/24 percent, with numeric columns aligned to the end. Desktop rows are 35px high, the table header 42px, and the footer at least 43px. Row heights are table layout constraints and may grow with content. There is no fixed viewport-height container or sticky element obstructing data.

| Breakpoint | Behavior |
| --- | --- |
| ≤65rem / 1040px | Outer padding 32px; metrics and table padding shrink; latest badge is omitted; gas tracks become narrower |
| ≤49rem / 784px | Outer padding 24px; metric values 26px; clock can wrap; decorative gas tracks and countdown are omitted |
| ≤38rem / 608px | Outer padding 16px with safe-area allowance; header wraps, wallet and clock share a second row; metrics stack; action targets are at least 44px tall |
| Mobile table | All four columns remain visible at 29/27/23/21 percent; numbers are 12px; block grouping commas and decorative icons are removed to preserve space; units move to a second header line; rows become 43px |

The 320, 390, 768, and 1440px viewport checks found no page-level horizontal overflow. Actual 320/390/1440px screenshots are delivered. Mobile scrolls vertically through all 12 blocks and the footer. At 1440×1100 the normal dashboard fits within the view. Messages and enlarged text can increase its height.

## Elevation & Depth

The surface system is deliberately flat: no shadows, gradients, glass effects, or floating panels. Small tonal differences define cards and table chrome; 1px borders establish structure. The latest row has one subdued amber surface. The skip link is the only positioned element with a stacking level (`z-index: 2`).

## Shapes

Use the 10px `--radius` for large panels and the brand mark. Buttons use 7px, count badges 5px, latest badges 4px, and decorative gas bars 2px. Panels are not nested card stacks. Status dots are circular. Messages use a 2px leading accent border with a small 5px end radius.

## Components

These are page patterns, not a separately exported component library:

- **Brand and clock** (`App.tsx:49`): title, small source label, inline Ethereum mark, and non-live-announcing UTC time. The first keyboard stop is the skip link.
- **Button** (`styles.css:86`): `.button` is neutral; `.primary` supplies amber fill to Connect wallet. Visible text accompanies icons. Connect, Connecting, Disconnect, Refresh and Retry states reflect the actual handler. Pending controls use native `disabled`; focus uses a 2px outline with 4px offset. Desktop Refresh is intentionally compact at 38px high; mobile controls grow to 44px.
- **Metrics** (`App.tsx:67`): labelled articles with uppercase labels, large monospace values, and two metadata lines. The feed is a real underlined external link whose accessible name announces its destination and new tab. Missing readings show `—` with explanatory text.
- **Status messages** (`App.tsx:87`): persistent, initially empty polite regions. Failures offer a next step; successful polling does not continuously announce the entire table or clock.
- **Block table** (`App.tsx:96`): native table, caption, scoped column/row headers, full timestamp semantics, newest-row text treatment, and optional decorative gas bars. All four required columns survive mobile adaptation. A single full-width message handles loading or initial failure; prior rows remain labelled on refresh failure.
- **Icons** (`App.tsx:6`): six inline SVG variants, 1.5px strokes and `currentColor`, hidden from assistive technology. No external icon requests.

Hover styles are limited to hover-capable pointers. With normal motion, buttons transition background and transform over 120ms and press to scale 0.96 using `cubic-bezier(.2, 0, 0, 1)`. With reduced motion there are no transitions. No automatic pulse or number animations are present.

## Do's and Don'ts

- Reuse `.app-shell`, semantic color tokens, existing numeric formatters, and the native table structure when extending this dashboard.
- Keep the three required readings first; preserve distinct metadata for oracle update time and RPC fetch time.
- Keep amber restrained and pair every status cue with words. Use the neutral button for Refresh.
- Keep mobile data readable by removing decoration or grouping separators before reducing primary table numbers below 12px.
- Do not add invented prices, price-change badges, charts, auto-signing, unrelated colors, stock imagery, or backend dependencies.
- Future page work would begin with the same shell, tokens, and typography; adding pages is outside this delivery's one-page scope.

This document records the final source and reviewed export. Coverage and unperformed checks are recorded in `artifacts/validation.md`.
