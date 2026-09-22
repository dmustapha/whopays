# DESIGN_SYSTEM.md — WhoPays · Direction A "Solari"

The durable design contract the design contract for the app.
Extracted from the shipped code (`src/styles.css`, `index.html`) — every value here is
literally in use, not aspirational. Token names are contract-locked by `tests/design.test.ts`.
Exact-value implementation spec: `whopays/DESIGN_SPEC.md`.

## Identity
- **World statement.** A split-flap departure board: money-truth posted in public, consequences on a clock.
- **Accent color.** Amber `#f0a92e` — the single AUTHORITY hue. It marks the countdown, the amount owing, and every call-to-action. Nothing else competes for it.
- **Signature element.** The **split-flap seat card** — a recessed flap face with three honest states (owing / paid ✓ / evicted) that physically flips (`rotateX`) the instant real Convex state changes. The flip IS the product; it appears nowhere as decoration.
- **Invariant phrase.** **"The scheduler doesn't negotiate."** — the deepest guarantee stated as narrative: an unpaid seat at cycle close is evicted and the waitlist promoted, automatically, with no appeal. Reused verbatim in the README. Product tagline: *"Watch a bill enforce itself."*

## Tokens

### Color (hex — mirrored to `:root` in `src/styles.css`; test-locked)
| token | hex | oklch (approx) | role |
|-------|-----|----------------|------|
| `--bg` | `#0b0b0d` | oklch(13% .004 286) | board void (page) |
| `--flap` | `#0e0e10` | oklch(15% .004 286) | split-flap face / inputs (elevation 0) |
| `--card` | `#141416` | oklch(18% .004 286) | board panel (elevation 1) |
| `--panel-2` | `#1b1b1f` | oklch(22% .004 286) | header bar / control deck (elevation 2) |
| `--line` | `#2a2a30` | oklch(27% .006 286) | hairlines / flap seams |
| `--text` | `#f4f1ea` | oklch(95% .01 90) | primary ink |
| `--muted` | `#8f8a80` | oklch(63% .01 80) | secondary ink (≥4.5 on `--bg`) |
| `--amber` | `#f0a92e` | oklch(78% .15 74) | AUTHORITY: countdown, owing, CTA |
| `--green` | `#57b06f` | oklch(69% .13 150) | SETTLEMENT borders/dots |
| `--green-ink` | `#79c78d` | oklch(78% .12 150) | paid status TEXT (≥4.5 on panel) |
| `--red` | `#c94f43` | oklch(58% .17 27) | EVICTION borders/dots |
| `--red-ink` | `#e8776b` | oklch(70% .14 27) | evicted status TEXT (≥4.5 on panel) |

### Type scale (fluid where it leads)
- Display — **Archivo Narrow** 600/700, uppercase, ls `.10em–.18em`. Masthead h1, board h2, rails, button labels, seat status.
- UI/prose — **Archivo** 400/600, normal case. Pitch, body, notes.
- Data — **IBM Plex Mono** 400/500/600, `tabular-nums`. Countdown, price, timestamps, seat labels, event log, ledger, codes.
- masthead h1 `clamp(1.5rem, 1.2rem + 1.4vw, 1.9rem)` · board h2 `1.05rem` · countdown `clamp(2rem, 1.4rem + 2.6vw, 2.6rem)` · rail label `.72rem` · seat label `.82rem` / seat status `1.02rem` · body `.95rem/1.55` · notes `.72–.78rem`.

### Spacing
Base unit **2px**; standard rhythm in 4/8-multiples. Card padding `16px 18px`; board sections `14–18px`; seat grid gap `10px`; rail margin `26px 0 10px`; page `main` `26px 20px 88px`, `max-width:1000px`.

### Border-radius (tokenized — no ad-hoc values)
`--r-xs:3px` · `--r-sm:5px` · `--r-md:6px` · `--r-lg:10px` · `--r-pill:99px`.

### Shadow scale — philosophy: **pixel-offset / recessed**
Split-flap faces are *inset*, never floating. Only two elevation shadows exist:
- `--el-1: inset 0 1px 0 rgba(255,255,255,.03)` — flap sheen (cards, glyph).
- `--el-2: 0 6px 20px rgba(0,0,0,.45)` — the single panel lift (hero board only).
- `--seam: inset 0 1px 0 rgba(255,255,255,.03), inset 0 -8px 16px rgba(0,0,0,.5)` — the seat's recessed flap-fold.

### Ready-to-paste `@theme` block
This project ships plain CSS custom properties (Vite + React, not Tailwind v4). Adopt the system by pasting this `:root` block — it is the verbatim contract in `src/styles.css`. Dark-only by design (a departure board has no light mode).

```css
:root{
  /* surfaces (elevation 0→2) */
  --bg:#0b0b0d; --flap:#0e0e10; --card:#141416; --panel-2:#1b1b1f; --line:#2a2a30;
  /* ink */
  --text:#f4f1ea; --muted:#8f8a80;
  /* semantics: one authority hue + state pairs */
  --amber:#f0a92e; --green:#57b06f; --green-ink:#79c78d; --red:#c94f43; --red-ink:#e8776b;
  /* radius */
  --r-xs:3px; --r-sm:5px; --r-md:6px; --r-lg:10px; --r-pill:99px;
  /* elevation (pixel-recessed) */
  --el-1:inset 0 1px 0 rgba(255,255,255,.03);
  --el-2:0 6px 20px rgba(0,0,0,.45);
  --seam:inset 0 1px 0 rgba(255,255,255,.03), inset 0 -8px 16px rgba(0,0,0,.5);
  /* type */
  --disp:"Archivo Narrow", system-ui, sans-serif;
  --ui:"Archivo", system-ui, sans-serif;
  --mono:"IBM Plex Mono", ui-monospace, monospace;
}
```

### Do's / Don'ts
- **DO** use amber as the only hue; green/red carry *state meaning*, never decoration.
- **DO** lighten surfaces per elevation (`--flap` → `--card` → `--panel-2`) instead of adding a second color.
- **DO** set numerals in IBM Plex Mono with `tabular-nums` so prices and clocks don't jitter.
- **DON'T** introduce SaaS-blue, neon, or a gradient-purple accent — a second hue breaks the board world.
- **DON'T** write ad-hoc `rounded-[17px]` / inline hex — reference the `--r-*` and color tokens.
- **DON'T** float cards with drop-shadows — this system is recessed; use `--el-1`/`--seam`, and `--el-2` only on the hero board.

## Status Legend
Color carries meaning, never decoration. Each seat/board status color maps to an exact state token from the Convex schema:

| color | token | meaning |
|-------|-------|---------|
| `--green-ink` `#79c78d` | `active_paid` | SETTLEMENT — dues paid, seat secured |
| `--amber` `#f0a92e` | `active_unpaid` | AUTHORITY / OWING — dues outstanding, countdown running toward eviction |
| `--red-ink` `#e8776b` | `evicted` | EVICTION — unpaid at cycle close, seat released + waitlist promoted |
| `--amber` (dashed) `#f0a92e` | `late_reported` | PAID reported by member, awaiting inbound-email confirmation |
| `--muted` (dashed) `#8f8a80` | `empty` | Open seat — join with one email to claim |

## Craft
- **Radius scale (CF-1).** All radii tokenized (`--r-xs..--r-pill`); zero inline pixel radii in components.
- **Elevation ladder (CF-2).** Dark-mode surfaces lighten by z-level: `--bg` (page) → `--flap` (inputs/seat) → `--card` (panel) → `--panel-2` (header/deck). No surface uses a color it isn't assigned.
- **Shadow philosophy (one, named): pixel-recessed.** `--el-1` sheen + `--seam` fold for inset faces; `--el-2` is the only lift, reserved for the hero board panel.
- **Glass recipe.** None — this world is opaque board metal, not glass. `backdrop-blur` is intentionally absent; depth comes from the recessed seam + rule-line background, not translucency.
- **Hover recipe (`@media (hover:hover)` only).** Seat: `translateY(-1px)` + border → `rgba(255,255,255,.14)`. Button: `translateY(-1px)` + `brightness(1.06)`. Links underline; ledger summary subject → amber. No hover state on touch devices.
- **Focus-visible recipe.** `outline:2px solid var(--amber); outline-offset:2px; border-radius:var(--r-xs)` — identical on input, button, summary, and anchor.
- **Signature element placement.** The split-flap seat grid lives on the Landing hero board (money-shot, ungated) and the Plan page; the flip fires only on real state change.

## Primitives
- **Card** — `background:var(--card); border:1px solid var(--line); border-radius:var(--r-md); padding:16px 18px; box-shadow:var(--el-1)`.
- **Board panel** — `.board.card`: padding 0, `overflow:hidden`, `box-shadow:var(--el-2)` (the one lifted surface).
- **Button** — Archivo Narrow uppercase, `background:var(--amber); color:#1a1305; border-radius:var(--r-sm); padding:11px 18px`; `:active` `scale(.98)`; `:disabled` `opacity:.5`.
- **Input** — `background:var(--flap); border:1px solid var(--line); border-radius:var(--r-sm); font-family:var(--mono)`.
- **Badge** — mono `.66rem` uppercase, `--r-xs`, `--line` border; variants `.demo` (amber), `.anchor` (green), `.muted`.
- **Seat** — the signature primitive (see Craft); `--flap` face + `--seam` + 50% flap-seam `::after`.
- **Meter** — `--r-pill` track on `--flap`, amber→`#d98c1e` fill, `width .4s ease`.

## Motion

### Motion tokens (contract-locked — EX-10 / peer diff-5)
Motion is as load-bearing as color here (the flip IS the product), so its values are named and contract-locked, not prose-only. These are the exact values in `src/styles.css` — treat them as the motion contract; do not drift per-component.

| token | value | applies to |
|-------|-------|-----------|
| `dur-flip` | `.5s` | seat status `flap` (rotateX) at eviction/promotion |
| `ease-flip` | `cubic-bezier(.7,0,.3,1)` | the flap fold easing |
| `dur-pulse` | `.6s ease` | `seatpulse` amber state-change ring |
| `dur-ui` | `.12s ease` | hover lift + button press (transform/filter) |
| `dur-border` | `.3s ease` | seat border-color state transition |
| `dur-meter` | `.4s ease` | budget meter fill width |
| `beacon` | `2s ease-in-out infinite` | live-chip / skeleton-label pulse |
| `settle` | `1.25s ease-in-out infinite` | branded skeleton "settling" shimmer |

- **Keyframe vocabulary (state-named only).** `flap`, `seatpulse`, `beacon`, `settle` — no decorative/idle motion; every animation maps to a real state event.
- **Stagger.** None on load; state-change animation is per-seat and event-driven, not page-staggered.
- **Reduced motion.** `@media (prefers-reduced-motion:reduce)` disables all animation + transition and hides the skeleton shimmer — the state change still lands as an instant color+text swap (see Accessibility).

## Accessibility (redundant encoding — peer risk-2/risk-3)
Status is never color-only. Every seat renders its state as an **uppercase text word beside the color+dot** — `paid ✓` / `owing` / `evicted` / `empty — join to claim` (`Board.tsx` seat-state span) — so the semantic layer survives grayscale and color-vision differences. Under `prefers-reduced-motion` the flip animation is removed but the text+color swap remains, so reduced-motion users still see the before/after state change, not a suppressed one. Contrast is gated in `tests/design.test.ts`: every state's `-ink` text hue is verified ≥4.5:1 on its panel surface (green-ink/red-ink on `--card`), amber ≥3:1, and primary/muted ink on `--bg`.
