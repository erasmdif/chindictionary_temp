/**
 * Gallery Component
 * 
 * React component for displaying image gallery with PhotoSwipe lightbox
 */


import { Gallery as PhotoSwipeGallery, Item } from 'react-photoswipe-gallery';
import type { GalleryImage } from './types';
import 'photoswipe/dist/photoswipe.css';

interface Props {
  images?: GalleryImage[];
  columns?: {
    min?: number;
    max?: number;
  };
  className?: string;
}

const captionStyle = `
  .pswp__custom-caption {
    background: rgba(0, 0, 0, 0.75);
    font-size: 16px;
    color: #fff;
    width: 100%;
    max-width: 100%;
    padding: 12px 16px;
    border-radius: 0;
    position: absolute;
    left: 0;
    bottom: 0;
    text-align: center;
  }
  .pswp__custom-caption a {
    color: #fff;
    text-decoration: underline;
  }
`;

export function Gallery({
  images = [],
  columns = { min: 200, max: 1 },
  className = '',
}: Props) {
  if (images.length === 0) {
    return null;
  }

  // Ensure defaults for columns
  const minWidth = columns?.min ?? 200;
  const maxWidth = columns?.max ?? 1;

  return (
    <>
      <style>{captionStyle}</style>
      <PhotoSwipeGallery
        options={{
          showHideAnimationType: 'fade',
          showAnimationDuration: 0,
          hideAnimationDuration: 0,
        }}
        uiElements={[
          {
            name: 'custom-caption',
            order: 9,
            isButton: false,
            appendTo: 'root',
            html: '',
            onInit: (el: any, pswpInstance: any) => {
              el.classList.add('pswp__custom-caption');
              
              pswpInstance.on('change', () => {
                const currSlideElement = pswpInstance.currSlide?.data?.element;
                let captionHTML = '';
                if (currSlideElement) {
                  const caption = currSlideElement.getAttribute('data-caption');
                  if (caption) {
                    captionHTML = caption;
                  }
                }
                el.innerHTML = captionHTML || '';
              });
            },
          },
        ]}
      >
        <div
          className={`gallery-grid ${className}`}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, ${maxWidth}fr))`,
            gap: '8px',
            padding: 0,
          }}
        >
          {images.map((image, index) => (
            <Item
              key={index}
              original={image.src}
              thumbnail={image.thumb}
              width={image.width}
              height={image.height}
              caption={image.caption || image.alt}
            >
              {({ ref, open }: any) => (
                <div
                  ref={ref}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer', overflow: 'hidden', borderRadius: '4px' }}
                  data-caption={image.caption || image.alt}
                  aria-label={`Open image: ${image.alt}`}
                >
                  <img
                    src={image.thumb}
                    alt={image.alt}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      aspectRatio: '1',
                      display: 'block',
                    }}
                  />
                </div>
              )}
            </Item>
          ))}
        </div>
      </PhotoSwipeGallery>
    </>
  );
}
