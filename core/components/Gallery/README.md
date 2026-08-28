# Gallery Component

A responsive image gallery component with PhotoSwipe lightbox integration, migrated from the Gatsby version.

## Features

- 📸 **PhotoSwipe Lightbox**: Full-screen image viewing with zoom and navigation
- 🎨 **Responsive Grid**: Auto-adjusting columns based on screen size
- 🔍 **Custom Captions**: Display image names or custom captions in lightbox
- 📝 **Caption JSON Support**: Optionally provide custom captions via `captions.json` file
- ⌨️ **Keyboard Navigation**: Arrow keys and ESC support
- ♿ **Accessible**: Proper ARIA labels and keyboard support
- 📁 **Auto-loading**: Automatically loads images from local `gallery/` folder (in `.astro` files only)
- 📦 **Flexible Loading**: Pass images directly for use in MDX

## Custom Captions

By default, captions are generated from filenames (e.g., `my-photo.jpg` → "My Photo").

### Using captions.json (Astro files)

Place a `captions.json` file in your gallery folder:

```
pages/
  my-page/
    gallery/
      photo1.jpg
      photo2.jpg
      captions.json
```

Format of `captions.json`:
```json
{
  "photo1.jpg": "A beautiful sunset over the mountains",
  "photo2.jpg": "Morning coffee with a view"
}
```

The component automatically loads and applies these captions!

### Custom captions in MDX

Use the `processGalleryImages` options:

```mdx
import { GalleryMdx, processGalleryImages } from '@core/components/Gallery';

export const images = import.meta.glob('./gallery/*.jpg', { eager: true });
export const captions = {
  "photo1.jpg": "Custom caption here",
  "photo2.jpg": "Another custom caption"
};

<GalleryMdx images={processGalleryImages(images, { captions })} client:idle />
```

## Important: Usage Depends on File Type

### In `.astro` Files - Auto-Loading Works

Place images in a `gallery/` subfolder next to your page:

```
pages/
  my-page.astro
  my-page/
    gallery/
      photo1.jpg
      photo2.jpg
```

Then use the Astro component:

```astro
---
import Gallery from '@core/components/Gallery/Gallery.astro';
---

<Gallery />
```

### In `.mdx` Files - Use import.meta.glob in Frontmatter

MDX files **can** use auto-loading by leveraging `import.meta.glob` in the frontmatter:

```mdx
---
title: My Gallery
---

import { GalleryMdx, processGalleryImages } from '@core/components/Gallery';

export const imageModules = import.meta.glob('./gallery/*.{jpg,jpeg,png,gif,webp,avif}', { eager: true });
export const galleryImages = processGalleryImages(imageModules);

<GalleryMdx images={galleryImages} client:idle />
```

**Key requirements:**
- `import.meta.glob` must be in the frontmatter with a **static string literal** path
- Use relative paths from the MDX file (e.g., `./gallery/*.jpg`)
- The `{ eager: true }` option enables build-time optimization
- `processGalleryImages` formats the images for the Gallery component

Alternatively, pass images manually:

```mdx
import { GalleryMdx } from '@core/components/Gallery';

<GalleryMdx images={[
  {
    src: '/gallery/img1.jpg',
    thumb: '/gallery/img1-thumb.jpg',
    width: 1200,
    height: 800,
    alt: 'Image 1',
    caption: 'My custom caption'
  }
]} client:idle />
```

### Automatic Loading (Recommended for .astro pages)

Place images in a `gallery/` subfolder next to your page, and the component will automatically load them:

```
pages/
  my-page/
    index.md
    gallery/
      photo1.jpg
      photo2.jpg
      photo3.jpg
```

Then in your page:

```mdx
---
title: My Page
---

import { GalleryAstro as Gallery } from '@core';

# My Photo Gallery

<Gallery client:idle />
```

The component will automatically:
1. Detect your current page path
2. Look for images in the `gallery/` subfolder
3. Load and display all supported image formats (jpg, jpeg, png, gif, webp, avif)
4. Sort by filename (descending by default)

### Manual Image Array

### Manual Image Array

For more control, pass images directly:

```jsx
import { Gallery } from '@core/components/Gallery';

const images = [
  {
    src: '/images/photo1.jpg',
    thumb: '/images/photo1-thumb.jpg',
    width: 1920,
    height: 1080,
    alt: 'Photo 1',
    caption: 'Beautiful landscape'
  },
  {
    src: '/images/photo2.jpg',
    thumb: '/images/photo2-thumb.jpg',
    width: 1920,
    height: 1080,
    alt: 'Photo 2'
  }
];

<Gallery images={images} client:idle />
```

### In MDX Files

```mdx
---
title: My Gallery Page
---

import { GalleryMdx as Gallery } from '@core/components/Gallery';

# My Photo Gallery

<Gallery images={[
  {
    src: '/gallery/img1.jpg',
    thumb: '/gallery/img1-thumb.jpg',
    width: 1200,
    height: 800,
    alt: 'Image 1'
  },
  {
    src: '/gallery/img2.jpg',
    thumb: '/gallery/img2-thumb.jpg',
    width: 1200,
    height: 800,
    alt: 'Image 2'
  }
]} />
```

### Advanced Configuration

```jsx
<Gallery 
  images={images}
  columns={{ min: 250, max: 1 }}
  reverseSorting={true}
  className="my-custom-gallery"
  client:idle
/>
```

## Props

### `images` (required)
- **Type**: `GalleryImage[]`
- **Description**: Array of image objects to display

Each image object should have:
```typescript
{
  src: string;        // Full-size image URL
  thumb: string;      // Thumbnail image URL
  width: number;      // Original image width
  height: number;     // Original image height
  alt: string;        // Alt text for accessibility
  caption?: string;   // Optional caption (defaults to alt)
}
```

### `columns`
- **Type**: `{ min?: number; max?: number }`
- **Default**: `{ min: 200, max: 1 }`
- **Description**: Grid column configuration
  - `min`: Minimum column width in pixels
  - `max`: Maximum number of columns (1 = equal width columns)

### `reverseSorting`
- **Type**: `boolean`
- **Default**: `false`
- **Description**: Reverse the sorting order of images (applies to both auto-loaded and manual images)

### `path`
- **Type**: `string`
- **Optional**
- **Description**: Override the automatic path detection. Useful when you want to load images from a different page's gallery folder.

### `className`
- **Type**: `string`
- **Default**: `''`
- **Description**: Additional CSS classes for the gallery container

## Image Preparation

For best results, prepare two versions of each image:
1. **Thumbnail**: Smaller, optimized for grid display (recommended: 300x300px)
2. **Full-size**: Original or high-quality version for lightbox

### Example Script to Generate Thumbnails

```bash
# Using ImageMagick
for img in *.jpg; do
  convert "$img" -resize 300x300^ -gravity center -extent 300x300 "thumbs/${img}"
done
```

## Accessibility

The component includes:
- Proper `alt` attributes for all images
- Keyboard navigation (Enter/Space to open, Arrow keys in lightbox, ESC to close)
- ARIA labels for interactive elements
- Focus management

## Styling

The component uses inline styles for the grid layout. To customize:

```css
/* In your global.css */
.gallery-grid img {
  transition: transform 0.2s;
}

.gallery-grid img:hover {
  transform: scale(1.05);
}
```

## Migration Notes

This component was migrated from the Gatsby version with these changes:
- **GraphQL → Props**: Images are now passed as props instead of GraphQL queries
- **GatsbyImage → img**: Standard img tags replace GatsbyImage
- **Path handling**: Removed automatic file system loading; images must be passed explicitly
- **Astro integration**: Added Astro wrapper following the core component pattern

## Complete Example

```astro
---
// In an Astro page
import { Gallery } from '@core/components/Gallery';

const galleryImages = [
  {
    src: '/public/gallery/beach1.jpg',
    thumb: '/public/gallery/thumbs/beach1.jpg',
    width: 1920,
    height: 1280,
    alt: 'Beach sunset',
    caption: 'Beautiful sunset at the beach'
  },
  {
    src: '/public/gallery/beach2.jpg',
    thumb: '/public/gallery/thumbs/beach2.jpg',
    width: 1920,
    height: 1280,
    alt: 'Beach waves',
    caption: 'Crashing waves'
  },
  {
    src: '/public/gallery/beach3.jpg',
    thumb: '/public/gallery/thumbs/beach3.jpg',
    width: 1920,
    height: 1280,
    alt: 'Beach rocks',
  }
];
---

<html>
  <head>
    <title>My Gallery</title>
  </head>
  <body>
    <h1>Beach Photos</h1>
    <Gallery 
      images={galleryImages}
      columns={{ min: 250, max: 1 }}
      client:idle 
    />
  </body>
</html>
```

## Known Limitations

- Images must be manually specified (no automatic directory scanning)
- Thumbnails must be pre-generated
- Full-size images should be optimized before uploading

## Future Enhancements

- [ ] Automatic thumbnail generation using Sharp
- [ ] Directory-based image loading with glob patterns
- [ ] Lazy loading for large galleries
- [ ] Image optimization integration
- [ ] Virtual scrolling for very large galleries
