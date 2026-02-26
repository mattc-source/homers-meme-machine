# Homer's Meme Machine — Style Guide

Inspired by the Simpsons opening title card: yellow logo against a classic blue Springfield sky.

---

## Color Palette

### Sky Blues
| Name         | Hex       | Usage                              |
|--------------|-----------|------------------------------------|
| Sky Deep     | `#4A9DC5` | Top of background gradient         |
| Sky Mid      | `#70B9D8` | Mid gradient                       |
| Sky Light    | `#96CDE0` | Lower gradient                     |
| Sky Pale     | `#B8DFF0` | Bottom gradient / cloud fill       |

### Clouds
| Name           | Hex       | Usage                              |
|----------------|-----------|------------------------------------|
| Cloud White    | `#FFFFFF` | Cloud body                         |
| Cloud Shadow   | `#D0E8F5` | Underside / shadow of clouds       |
| Cloud Soft     | `#E8F4FA` | Wispy cloud edges                  |

### Simpsons Brand
| Name           | Hex       | Usage                              |
|----------------|-----------|------------------------------------|
| Simpson Yellow | `#FED90F` | Logo, buttons, accents (THE color) |
| Outline Black  | `#1A1A1A` | Text outlines, shadows, borders    |
| Springfield    | `#F5A623` | Warm accent — Homer's skin tone    |

### UI
| Name           | Hex       | Usage                              |
|----------------|-----------|------------------------------------|
| White          | `#FFFFFF` | Card backgrounds, input fields     |
| Off-White      | `#FAFAFA` | Subtle surface backgrounds         |
| Dark Text      | `#1A1A1A` | Body copy, labels                  |
| Muted Text     | `#5A7A8A` | Secondary labels, metadata         |

---

## Typography

### Display / Logo
- **Font:** Bangers (Google Fonts)
- **Use:** H1 "Homer's", hero titles, large decorative text
- **Style:** All caps, wide letter-spacing (~0.04em), slightly skewed feel
- **Color:** Simpson Yellow `#FED90F` with a 2–3px dark text-shadow or -webkit-text-stroke

### Accent / Handwritten
- **Font:** Permanent Marker (Google Fonts)
- **Use:** "Meme Machine" subheading, playful callouts, chip/tag labels
- **Style:** Lowercase feels more natural; natural letter-spacing
- **Color:** White or Yellow depending on background

### Body / UI
- **Font:** System sans-serif stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Use:** Paragraphs, input placeholders, metadata, footer
- **Style:** Regular weight, 1rem–1.1rem, comfortable line-height (~1.6)

### Meme Text (Frinkiac overlay)
- **Font:** Impact (rendered server-side by Frinkiac)
- **Style:** All caps, white with black outline — classic meme format
- **Max chars per line:** 26 (tighter = less clipping)
- **Max lines:** 4

---

## Spacing & Layout

- **Max content width:** 1100px (centered)
- **Grid columns:** `repeat(auto-fill, minmax(320px, 1fr))`
- **Card border-radius:** 16px
- **Button border-radius:** 8px (pill feel: 999px for chips)
- **Consistent padding unit:** 1rem (16px)

---

## Elevation & Shadow

- **Cards:** `box-shadow: 0 6px 24px rgba(0,0,0,0.18)`
  *(use box-shadow, NOT filter: drop-shadow — drop-shadow bleeds around border-radius)*
- **Lightbox inner:** `box-shadow: 0 24px 80px rgba(0,0,0,0.55)`
- **Buttons (hover):** `box-shadow: 0 4px 12px rgba(0,0,0,0.25)`

---

## Iconography & Illustration

- Clouds: CSS blob shapes using `border-radius` multi-value trick
- Donut emoji 🍩 — loading indicator
- No icon library needed; emoji + CSS shapes cover all cases

---

## Animation Principles

- **Cloud curtain reveal:** 9 organic blobs scatter outward on load (forwards fill — never re-appear)
- **Hero reveal:** fade-in with blur dissolve, ~1.6s, delayed until clouds clear
- **Card entrance:** translateY(28px) → 0 + opacity, staggered 90ms per card
- **Easing:** `ease-in-out` for cloud scatter; `ease` for UI reveals
- **Rule:** animations should feel organic and cinematic — avoid snappy/mechanical motion

---

## Voice & Naming

- Search button: **D'OH!** (not "Search" or "Go")
- Loading states: "Consulting Professor Frink…" → "Searching Springfield…" → "Finding the quotes…"
- Download button: **DOWNLOAD** (all caps, yellow)
- No results: "D'oh! No Simpsons moment found."
- Error: "⚠️ Something went wrong. Frinkiac might be napping."

---

## Design Do's & Don'ts

**Do:**
- Use Simpson Yellow as the primary action color
- Keep the sky as the full background — no solid white or grey panels
- Let the images float — minimal chrome around meme cards
- Use thick outlines/strokes on display text for the cartoon feel

**Don't:**
- Use orange buttons (yellow only)
- Add borders or dark outlines around image cards (drop-shadow bug)
- Use fixed aspect-ratio on meme images (quotes get cropped)
- Include cards where the quote wraps to more than 4 lines
