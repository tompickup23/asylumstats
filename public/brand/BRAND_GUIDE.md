# Asylum Stats: Brand Guide

## Identity

**Name:** Asylum Stats
**Tagline:** UK Asylum Accountability
**Subtitle:** Routes, hotel secrecy, public money, and local pressure
**Concept:** A radar scanner actively monitoring data points across the UK. The sweep reveals what's hidden: hotel locations, spending patterns, geographic pressure. Orange blips = alerts (hotels, costs). Cyan = data points. Green = resolved areas.

## Logo Variants

| File | Use Case |
|------|----------|
| `logo.svg` | Primary horizontal: website header, press, reports |
| `logo-stacked.svg` | Square: social media avatars, app icon |
| `icon.svg` | Radar icon only (dark bg): favicons, UI elements |
| `icon-light.svg` | Radar icon only (light bg): print, email |
| `favicon.svg` | Browser tab (32x32, dark bg with radar) |
| `apple-touch-icon.svg` | iOS home screen (180x180) |

## Color System

### Primary Palette

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Cyan** | `#06b6d4` | 6, 182, 212 | Primary accent, radar rings, data points, links |
| **Cyan Dark** | `#0891b2` | 8, 145, 178 | Hover states, light-bg variant |
| **Amber** | `#f59e0b` | 245, 158, 11 | Alerts, hotel costs, warnings, orange blips |
| **Emerald** | `#10b981` | 16, 185, 129 | Positive, resolved, route data |
| **Orange** | `#ff8b61` | 255, 139, 97 | Spending alerts, high-cost indicators |

### Surface Palette

| Name | Hex | Usage |
|------|-----|-------|
| **Abyss** | `#04070d` | Page background, near-black with blue undertone |
| **Deep** | `#0b1220` | Card backgrounds, elevated surfaces |
| **Slate** | `#1e293b` | Borders, dividers, input backgrounds |
| **Muted** | `#91a7c4` | Secondary text, labels, timestamps |
| **Ink Soft** | `#dbe7f7` | Body text |
| **Ink** | `#f5f7fb` | Headings, emphasis, primary text |

### Semantic Data Colors

| Meaning | Hex | Usage |
|---------|-----|-------|
| **Hotel/Alert** | `#f59e0b` | Orange blip: active hotel, cost spike |
| **Data Point** | `#06b6d4` | Cyan blip: standard observation |
| **Resolved** | `#10b981` | Green blip: area with full data coverage |
| **Critical** | `#ef4444` | Red: spending anomaly, secrecy flag |
| **Neutral** | `#6b7280` | Grey: no data, pending |

## Typography

**Primary:** Manrope (variable weight, geometric sans-serif)
**Fallback:** Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif

| Element | Weight | Size | Tracking |
|---------|--------|------|----------|
| H1 | 800 | 32px | -0.5px |
| H2 | 700 | 24px | -0.3px |
| H3 | 600 | 18px | 0 |
| Body | 400 | 16px | 0 |
| Caption/Label | 500 | 12px | 1px |
| "STATS" subtitle | 400 | varies | 4-5px |
| KPI Value | 800 | 48px | -1px |

## The Radar Icon

The radar scanner is the core brand mark:
- **3 concentric rings**: tracking depth (national → regional → local)
- **Sweep wedge**: active scanning, real-time monitoring
- **Crosshair lines**: precision, data accuracy
- **Data blips**: each color represents a data category:
  - Orange: alerts (hotels, cost spikes, secrecy flags)
  - Cyan: standard data points (route observations)
  - Green: resolved (full coverage areas)
- **Centre dot**: the observer, the platform itself

### Icon at Scale
- 80px+: Full detail (all rings, blips, crosshairs)
- 32-64px: Simplified (outer ring, sweep, 2-3 blips)
- 16-24px: Minimal (outer ring, centre dot, 1 blip)

## Logo Usage Rules

1. **Dark backgrounds only** for primary logo, because the radar needs contrast
2. Use `icon-light.svg` on white/light backgrounds (darker cyan #0891b2)
3. **Minimum size:** Icon at 24px, full logo at 140px wide
4. **Clear space:** 1x icon diameter on all sides
5. **Never** fill the radar rings with solid color
6. **Never** change the blip colors (they encode data meaning)
7. The sweep direction (NE quadrant) is fixed, representing forward scanning

## CSS Custom Properties

```css
:root {
  --as-bg: #04070d;
  --as-bg-soft: #0b1220;
  --as-ink: #f5f7fb;
  --as-ink-soft: #dbe7f7;
  --as-muted: #91a7c4;
  --as-cyan: #06b6d4;
  --as-cyan-dark: #0891b2;
  --as-amber: #f59e0b;
  --as-emerald: #10b981;
  --as-orange: #ff8b61;
  --as-red: #ef4444;
  --as-border: #1e293b;
  --as-radius: 28px;
  --as-radius-sm: 20px;
  --as-font: 'Manrope', Inter, -apple-system, system-ui, sans-serif;
}
```

## Social Media Specs

| Platform | Format | Size | Notes |
|----------|--------|------|-------|
| OG Image | 1200x630 | Radar + headline + stat | Dark bg, cyan accent |
| Twitter/X | 1200x628 | Same as OG | |
| Instagram Post | 1080x1080 | Stacked logo + stat + headline | |
| Instagram Reel | 1080x1920 | Vertical, radar top, data below | |
| Avatar | 400x400 | `logo-stacked.svg` on dark bg | |
| Favicon | 32x32 | `favicon.svg` | |
| Apple Touch | 180x180 | `apple-touch-icon.svg` | |

## Legal Notes

- "Asylum Stats" is purely descriptive: it tracks public asylum statistics
- All data sourced from official government publications (Home Office, ONS)
- The radar icon is original artwork, with no IP conflicts
- The color palette uses standard Tailwind CSS colors, with no proprietary claims
- Content follows strict editorial scope rules (documented in AGENTS.md)
