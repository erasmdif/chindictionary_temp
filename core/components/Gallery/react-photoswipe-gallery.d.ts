/**
 * Type declarations for react-photoswipe-gallery
 * Since @types/react-photoswipe-gallery doesn't exist, we provide minimal types
 */

declare module 'react-photoswipe-gallery' {
  import { ReactNode } from 'react';

  export interface GalleryProps {
    children?: ReactNode;
    options?: any;
    uiElements?: any[];
  }

  export interface ItemProps {
    original: string;
    thumbnail?: string;
    width: number | string;
    height: number | string;
    caption?: string;
    children?: (props: { ref: any; open: () => void }) => ReactNode;
  }

  export const Gallery: React.FC<GalleryProps>;
  export const Item: React.FC<ItemProps>;
}
