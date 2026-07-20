---
name: Modern Bistro Heritage
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#5d3f3b'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#926f69'
  outline-variant: '#e7bdb6'
  surface-tint: '#c00000'
  primary: '#970000'
  on-primary: '#ffffff'
  primary-container: '#c40000'
  on-primary-container: '#ffd1ca'
  inverse-primary: '#ffb4a8'
  secondary: '#635d5e'
  on-secondary: '#ffffff'
  secondary-container: '#e9e0e1'
  on-secondary-container: '#696364'
  tertiary: '#474948'
  on-tertiary: '#ffffff'
  tertiary-container: '#5f6160'
  on-tertiary-container: '#dcdcda'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930000'
  secondary-fixed: '#e9e0e1'
  secondary-fixed-dim: '#cdc4c5'
  on-secondary-fixed: '#1e1b1c'
  on-secondary-fixed-variant: '#4b4546'
  tertiary-fixed: '#e2e3e1'
  tertiary-fixed-dim: '#c6c7c5'
  on-tertiary-fixed: '#1a1c1b'
  on-tertiary-fixed-variant: '#454746'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  container-max: 1200px
---

## Brand & Style

This design system bridges the gap between classic Italian-American diner aesthetics and a clean, high-performance digital experience. Drawing inspiration from the provided logo, the visual language utilizes a refined **Modern-Corporate** style with **Retro-Tactile** accents. It prioritizes clarity and efficiency for food ordering while maintaining the energetic, friendly personality of the "Prego's Cucina" brand.

The aesthetic is defined by high-contrast color blocking, generous use of white space to prevent visual clutter, and subtle nods to traditional pizzeria motifs—specifically the checkerboard pattern—used as a functional divider rather than just decoration. The goal is to evoke a sense of reliability, speed, and culinary tradition.

## Colors

The palette is derived directly from the brand logo to ensure instant recognition. 
- **Primary (Heritage Red):** A bold, appetizing red used for primary actions, price points, and brand-critical identifiers. 
- **Secondary (Charcoal Black):** Used for primary typography and iconography to provide a grounded, professional contrast to the red.
- **Tertiary (Cream White):** A slightly warm off-white used as the global background color to reduce eye strain compared to pure hex white, enhancing the "bistro" feel.
- **Neutral:** A range of grays used for secondary text and decorative borders.

The "Checkerboard" pattern (Red/White) should be used sparingly as a header accent or footer decoration to reinforce the visual identity.

## Typography

The typography system replaces the previous condensed style with **Hanken Grotesk** for headings to maintain a bold, high-impact presence that is significantly more legible and modern. This is paired with **Inter** for all functional and body text to provide a neutral, systematic foundation.

Headlines use heavy weights (700-800) and tight letter spacing to mimic the punchy nature of the logo. Body text is optimized for readability in menu descriptions and interface labels. All uppercase styling is reserved for labels and small buttons to ensure a professional, structured hierarchy.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. The layout is structured around a "Container-First" approach where content is grouped in clear, defined modules.

- **Rhythm:** An 8px base unit drives all padding and margin decisions.
- **Margins:** Desktop views utilize a maximum container width of 1200px with 24px gutters. Mobile views utilize 16px side margins to maximize space for imagery.
- **Reflow:** On mobile, complex menu grids collapse into a single-column vertical list, ensuring price points and "Add to Cart" actions remain prominent.

## Elevation & Depth

To maintain a crisp, professional look, this system avoids heavy shadows. Instead, it uses **Tonal Layers** and **Low-Contrast Outlines**.

1.  **Level 0 (Base):** Tertiary Cream background.
2.  **Level 1 (Cards/Surface):** Pure White (#FFFFFF) surfaces with a subtle 1px border (#E0E0E0).
3.  **Level 2 (Interaction):** A very soft, diffused ambient shadow (10% opacity) is used only for active states or floating elements like a "Cart" button.

Depth is primarily communicated through color blocking (e.g., a Red header against a White background) rather than physical simulation.

## Shapes

The shape language is **Soft**. Elements use a 0.25rem (4px) base radius. This provides a subtle modern touch without feeling overly "bubbly" or juvenile, maintaining the professional "Cucina" feel.

- **Small elements:** (Checkboxes, small tags) 4px.
- **Large elements:** (Menu cards, primary buttons) 8px.
- **Special elements:** The brand character (the chef) and logo icons should be contained within circular frames to contrast against the otherwise geometric UI.

## Components

### Buttons
- **Primary:** Solid Heritage Red background with White Inter-Bold text. 8px corner radius.
- **Secondary:** Transparent with 1px Charcoal border and Charcoal text.
- **Ghost:** No border, Red text for low-priority actions.

### Input Fields
- White background with a 1px Neutral border. On focus, the border thickens to 2px and changes to Heritage Red.

### Cards (Menu Items)
- White surface, 1px light gray border. Food photography should fill the top half of the card. Titles in Hanken Grotesk, price points in Bold Red Inter.

### Checkerboard Divider
- A custom component used to separate major sections (e.g., between Hero and Menu). It uses 16px red/white squares as seen in the brand asset.

### Chips/Tags
- Used for dietary info (e.g., "Vegetarian"). Small 4px radius, light gray background with Charcoal text to keep the focus on the food.