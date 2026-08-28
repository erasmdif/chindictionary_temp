/**
 * Gallery Component - MDX Wrapper
 * 
 * Wrapper for use in MDX content with direct image prop support
 * Automatically processes raw import.meta.glob output
 */


import { Gallery as GalleryClient } from './Gallery';
import { processGalleryImages } from './galleryUtils';
import type { GalleryProps, GalleryImage } from './types';

interface GalleryMdxProps extends Omit<GalleryProps, 'images'> {
  images: GalleryImage[] | Record<string, any>;
  reverseSorting?: boolean;
}

export function GalleryMdx({ images, reverseSorting, columns = { min: 200, max: 1 }, ...props }: GalleryMdxProps) {
  // Detect if images is raw import.meta.glob output (object with module paths as keys)
  // or already processed GalleryImage array
  const processedImages = Array.isArray(images)
    ? images
    : processGalleryImages(images, { reverseSorting });

  return <GalleryClient images={processedImages} columns={columns} {...props} />;
}
