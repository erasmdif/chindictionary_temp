/**
 * Utility functions for Gallery component
 */
import type { GalleryImage } from './types';

/**
 * Extract filename without extension from filepath
 */
export function getFileName(filepath: string): string {
  const parts = filepath.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Format filename into readable caption
 * e.g., "my-image-file" -> "My Image File"
 */
export function formatFilename(filename: string): string {
  return filename
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract base filename without resolution suffix for fuzzy matching
 * Examples:
 * - "children-593313_1280.jpg" → "children-593313"
 * - "coffee-2306471_1920.jpg" → "coffee-2306471"
 */
function getBaseFilename(filename: string): string {
  // Remove extension first
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  // Remove resolution suffix (e.g., _1280, _1920, _640x480)
  return withoutExt.replace(/[_-]\d+(?:x\d+)?$/, '');
}

/**
 * Apply custom captions from a captions object
 * Uses fuzzy matching to handle different image resolutions
 * Falls back to filename-based captions if not found
 */
export function applyCaptions(
  images: GalleryImage[],
  captions?: Record<string, string>
): GalleryImage[] {
  if (!captions) return images;

  // Create lookup map with multiple keys for fuzzy matching
  const captionLookup = new Map<string, string>();
  Object.entries(captions).forEach(([key, value]) => {
    const baseKey = getBaseFilename(key);
    captionLookup.set(baseKey, value); // Base filename (fuzzy match)
    captionLookup.set(key, value); // Exact filename match
    captionLookup.set(key.replace(/\.[^.]+$/, ''), value); // Filename without extension
  });

  return images.map(img => {
    // Extract filename from Astro-processed path
    const srcParts = img.src.split('/');
    const srcFilename = srcParts[srcParts.length - 1].split('?')[0];
    const filenameNoExt = srcFilename.replace(/\.[^.]+$/, '');
    const baseFilename = getBaseFilename(srcFilename);
    
    // Try matching: exact → no ext → base (fuzzy)
    const customCaption = 
      captionLookup.get(srcFilename) ||
      captionLookup.get(filenameNoExt) ||
      captionLookup.get(baseFilename);
    
    return customCaption
      ? { ...img, caption: customCaption, alt: customCaption }
      : img;
  });
}

/**
 * Sort images by filename
 */
export function sortImages(images: GalleryImage[], reverse: boolean = false): GalleryImage[] {
  const sorted = [...images].sort((a, b) => {
    const nameA = getFileName(a.src);
    const nameB = getFileName(b.src);
    return nameB.localeCompare(nameA); // DESC by default
  });

  return reverse ? sorted.reverse() : sorted;
}

/**
 * Process image modules from import.meta.glob into GalleryImage format
 * Use this in MDX frontmatter to prepare images for Gallery component
 * 
 * @example
 * ```tsx
 * // In MDX frontmatter:
 * import { processGalleryImages } from '@core/components/Gallery';
 * 
 * export const images = import.meta.glob('./gallery/*.{jpg,jpeg,png,gif,webp,avif}', { eager: true });
 * 
 * // In content:
 * <GalleryMdx images={images} client:idle />
 * ```
 */
export function processGalleryImages(
  imageModules: Record<string, any>,
  options?: {
    reverseSorting?: boolean;
    captions?: Record<string, string>;
  }
): GalleryImage[] {
  const { reverseSorting = false, captions } = options || {};
  
  const images = Object.entries(imageModules).map(([filepath, module]) => {
    const img = module.default;
    const filename = getFileName(filepath);
    return {
      src: img.src,
      thumb: img.src,
      width: img.width,
      height: img.height,
      alt: formatFilename(filename),
      caption: formatFilename(filename)
    } as GalleryImage;
  });

  const imagesWithCaptions = applyCaptions(images, captions);

  if (reverseSorting) {
    return imagesWithCaptions.reverse();
  }

  return imagesWithCaptions;
}
