# Core Components

This directory contains reusable, framework-level components that provide essential functionality for the s:CMS system.

## Components

### SEO.astro

Comprehensive SEO component that generates meta tags and structured data for search engines and social media.

**Usage:**

```astro
---
import SEO from '@core/components/SEO/SEO.astro';
---

<head>
  <SEO 
    title="Page Title"
    description="Page description"
    image="/images/og-image.jpg"
    author="Author Name"
    isArticle={true}
    datePublished="2026-01-14"
    tags={['tag1', 'tag2']}
  />
</head>
```

**Props:**
- `title` (string, optional) - Page title
- `description` (string, optional) - Page description
- `image` (string, optional) - Social media image URL
- `author` (string, optional) - Content author name
- `isArticle` (boolean, optional) - Whether this is an article (adds Article schema)
- `datePublished` (string|Date, optional) - Publication date
- `dateModified` (string|Date, optional) - Last modification date
- `tags` (string[], optional) - Article tags
- `canonical` (string, optional) - Canonical URL override

**Features:**
- Open Graph meta tags for Facebook/LinkedIn
- Twitter Card meta tags
- JSON-LD structured data for articles
- Automatic canonical URL generation
- Image URL resolution

## Extending Core

Core components should be:
1. **Framework-level**: Provide essential, reusable functionality
2. **Well-documented**: Include usage examples and prop descriptions
3. **Tested**: Ensure they work across different use cases
4. **Minimal dependencies**: Keep external dependencies to a minimum

## User Customization

Users should **not** edit core components directly. Instead:
- Override behavior in `usr/layouts/`
- Create custom components in `usr/components/`
- Extend layouts with slots and composition
