# Research: SEO: page titles, meta descriptions, sitemap submission

Generated: 2026-04-14
Project: asylum_stats

### **SEO Research Brief: Page Titles, Meta Descriptions, Sitemap Submission**
**Project:** Asylum Stats
**Priority:** High

---

### **1. Key Findings**
- **Current SEO Gaps:**
  - No structured page titles/meta descriptions in `BaseLayout.astro` (used across all pages).
  - No sitemap.xml or robots.txt in the repo (critical for search engine indexing).
  - Missing OpenGraph (OG) tags for social sharing (e.g., Twitter/X, LinkedIn).
  - No canonical URLs defined, risking duplicate content issues.

- **Competitor Analysis:**
  - Competitors like [Migration Observatory](https://migrationobservatory.ox.ac.uk/) use descriptive titles/meta tags (e.g., *"UK Asylum Support Trends | Migration Observatory"*).
  - UK Home Office asylum stats pages rank well with titles like *"Asylum statistics: year ending March 2024"* ([source](https://www.gov.uk/government/statistics/asylum-statistics-year-ending-march-2024)).

- **Astro SEO Plugins:**
  - The repo uses Astro, which supports `@astrojs/sitemap` and `@astrojs/seo` for automated SEO optimization.

---

### **2. Next Steps**
#### **A. Page Titles & Meta Descriptions**
1. **Update `BaseLayout.astro`** (primary template for all pages):
   - File: `/opt/asylumstats/src/layouts/BaseLayout.astro`
   - Add dynamic `<title>` and `<meta name="description">` tags using Astro props:
     ```astro
     ---
     const { title, description } = Astro.props;
     ---
     <title>{title} | Asylum Stats UK</title>
     <meta name="description" content={description} />
     ```
   - Example for `/compare` page:
     ```astro
     ---
     title: "Compare Asylum Routes & Schemes"
     description: "Compare UK asylum support, resettlement, and contingency accommodation data by region."
     ---
     ```

2. **Update Page Components:**
   - Modify each page (e.g., `src/pages/compare.astro`) to pass props:
     ```astro
     ---
     import BaseLayout from '../layouts/BaseLayout.astro';
     ---
     <BaseLayout title="Compare Asylum Routes" description="..." />
     ```

#### **B. Sitemap & Robots.txt**
1. **Install `@astrojs/sitemap`:**
   ```bash
   cd /opt/asylumstats
   npx astro add sitemap
   ```
   - This auto-generates `public/sitemap.xml` with all static pages.

2. **Create `robots.txt`:**
   - File: `/opt/asylumstats/public/robots.txt`
   - Add:
     ```
     User-agent: *
     Allow: /
     Sitemap: https://asylumstats.co.uk/sitemap.xml
     ```

#### **C. OpenGraph (OG) Tags**
- Add to `BaseLayout.astro`:
  ```astro
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={Astro.request.url} />
  <meta property="og:type" content="website" />
  ```

#### **D. Submit Sitemap to Google**
1. **Verify Site in Google Search Console:**
   - URL: [https://search.google.com/search-console](https://search.google.com/search-console)
   - Submit `https://asylumstats.co.uk/sitemap.xml`.

2. **Ping Google:**
   ```bash
   curl https://www.google.com/ping?sitemap=https://asylumstats.co.uk/sitemap.xml
   ```

---

### **3. Resources**
- **Astro SEO Docs:** [https://docs.astro.build/en/guides/seo/](https://docs.astro.build/en/guides/seo/)
- **Google SEO Starter Guide:** [https://developers.google.com/search/docs/fundamentals/seo-starter-guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- **Sitemap Validator:** [https://www.xml-sitemaps.com/validate-xml-sitemap.html](https://www.xml-sitemaps.com/validate-xml-sitemap.html)

---

### **4. Risks/Blockers**
- **Blocker:** No existing SEO framework in place. Mitigation: Use Astro’s built-in plugins.
- **Risk:** Duplicate content if canonical URLs aren’t defined. Fix: Add `<link rel="canonical">` to `BaseLayout.astro`.
- **Time Estimate:** 2–3 hours for implementation + 1 hour for testing/submission.