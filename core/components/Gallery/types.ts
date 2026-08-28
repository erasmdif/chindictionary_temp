/**
 * Type definitions for Gallery component
 */

export interface GalleryImage {
  src: string;
  thumb: string;
  width: number;
  height: number;
  alt: string;
  caption?: string;
}

export interface GalleryProps {
  /**
   * Optional path to the gallery folder relative to public/
   * If not provided, uses images from current page location
   * Example: "data/my-gallery"
   */
  path?: string;

  /**
   * Array of image objects to display
   * Can be provided directly instead of using path-based loading
   */
  images?: GalleryImage[];

  /**
   * Reverse the default sorting order (DESC by name) of images
   * When true, images will be sorted in ascending order
   */
  reverseSorting?: boolean;

  /**
   * Grid configuration
   */
  columns?: {
    min?: number;
    max?: number;
  };

  /**
   * Additional CSS classes
   */
  className?: string;
}
