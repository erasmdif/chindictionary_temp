# Blog Feature

The s:CMS blog system uses Astro's content collections for type-safe, schema-validated blog posts.

## Structure

```
usr/
├── content/
│   ├── config.ts              # Content collection schemas
│   └── blog/                  # Blog post content
│       ├── post-1.mdx
│       ├── post-2.mdx
│       └── ...
└── pages/
    └── blog/
        ├── index.astro        # Blog listing page
        └── [...slug].astro    # Individual post pages
```

## Creating a New Blog Post

1. Create a new MDX file in `usr/content/blog/`:

```mdx
---
title: 'Your Post Title'
description: 'A brief description of your post'
date: 2025-01-30
author: 'Your Name'
tags: ['tutorial', 'guide']
image: '/images/blog/your-image.jpg'
draft: false
---

# Your Post Title

Your content goes here...
```

2. The post will automatically appear at `/blog/your-file-name`

## Required Frontmatter Fields

- **title** (string): Post title
- **description** (string): Brief description for SEO and previews
- **date** (date): Publication date (YYYY-MM-DD format)

## Optional Frontmatter Fields

- **author** (string): Author name
- **tags** (array): Category tags for the post
- **image** (string): Featured image path
- **draft** (boolean): Set to `true` to hide from listings

## Schema Validation

The blog schema is defined in `usr/content.config.ts` and provides:

- Type safety in TypeScript
- Automatic validation on build
- IntelliSense support in your editor

## Dynamic Routing

The blog uses Astro's dynamic routing:

- `/blog` → Lists all published posts (sorted by date)
- `/blog/post-slug` → Individual post page

## Querying Posts

To query blog posts in other pages:

```typescript
import { getCollection } from 'astro:content';

const posts = await getCollection('blog', ({ data }) => {
  return data.draft !== true; // Exclude drafts
});

const sortedPosts = posts.sort(
  (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
);
```

## Features

✅ **Type-safe content** - Schema validation  
✅ **MDX support** - Use components in posts  
✅ **Tag system** - Categorize posts  
✅ **Draft mode** - Hide unpublished posts  
✅ **SEO-friendly** - Automatic meta tags  
✅ **Responsive design** - Mobile-friendly cards  

## Example Posts

The blog includes 3 demonstration posts:

1. **Getting Started with s:CMS** - Introduction and quick start guide
2. **Building Photo Galleries** - Gallery component tutorial
3. **Creating Interactive Maps** - Map component guide

Feel free to edit or delete these examples!
