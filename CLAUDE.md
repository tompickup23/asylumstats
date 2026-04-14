# Asylum Stats — Claude Code Context

## Overview
UK Asylum & Refugee Accountability — follow the migrants, follow the money. Data-driven asylum and immigration tracker.

**Stack**: Astro | TypeScript | Tailwind CSS
**Hosting**: Cloudflare Pages
**Data**: Government datasets (Home Office, ONS)
**Automation**: 3 GitHub Actions (deploy, site-checks, refresh-data)

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:4321)
npm run build        # Production build
npm run preview      # Preview production build
```

## Key Patterns
- Astro pages in `src/pages/` with file-based routing
- Data files in `src/data/` or `public/data/`
- Components use `.astro` syntax with frontmatter for data fetching
- Charts and visualisations for asylum statistics
- All data processing happens at build time (static site)
- GitHub Actions auto-refresh data on schedule

## Data Sources
- Home Office immigration statistics
- ONS population data
- Government spending/cost data
- Asylum accommodation locations

## Rules
- All statistics must cite their source
- Data accuracy is critical — double-check numbers
- Keep pages under 200 lines, extract components
- Mobile-first responsive design
- SEO: every page needs title and meta description
- British English throughout

## Related Projects
- **ukdemographics** — Population demographics (JavaScript)
- **burnleycouncil** — Council transparency + Situation Room
- **tompickup.one** — Situation Room (burnleycouncil/situation-room)
