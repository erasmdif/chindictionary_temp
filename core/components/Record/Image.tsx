import { useContext } from 'react';
import { RecordContext } from './context';
import { getValueByDotPath } from './utils';

interface DirectusFileRef {
  id?: string;
  filename_download?: string;
  description?: string;
  title?: string;
}

export interface ImageProps {
  fieldName: string;
  index?: number | 'all';
  dEndPoint?: string;
  preset?: string | null;
  custom?: string | null;
  className?: string;
  alt?: string;
  record?: any;
}

function asFileRef(item: any): DirectusFileRef | null {
  if (!item) return null;

  if (item.directus_files_id && typeof item.directus_files_id === 'object') {
    return item.directus_files_id;
  }

  if (typeof item === 'object' && item.id) {
    return item;
  }

  return null;
}

function buildImageUrl(
  endpoint: string,
  file: DirectusFileRef,
  preset?: string | null,
  custom?: string | null,
): string {
  const base = `${endpoint.replace(/\/$/, '')}/assets/${file.id}${file.filename_download ? `/${file.filename_download}` : ''}`;

  if (preset) return `${base}?key=${encodeURIComponent(preset)}`;
  if (custom) return `${base}?${custom}`;
  return base;
}

export function Image({
  fieldName,
  index = 0,
  dEndPoint = import.meta.env.PUBLIC_DIRECTUS_URL,
  preset = null,
  custom = null,
  className,
  alt,
  record,
}: ImageProps) {
  const contextRecord = useContext(RecordContext);
  const sourceRecord = record ?? contextRecord;

  if (!sourceRecord) return null;

  const rawValue = getValueByDotPath(sourceRecord, fieldName);
  if (!rawValue) return null;

  const list = Array.isArray(rawValue) ? rawValue : [rawValue];

  // Render images: handle both plain URLs and Directus file objects
  const renderItems = list.map((item, idx) => {
    // Handle plain URL strings
    if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('/'))) {
      return (
        <img
          key={idx}
          src={item}
          alt={alt || fieldName}
          className={className}
        />
      );
    }

    // Handle Directus file objects
    const file = asFileRef(item);
    if (!file?.id) return null;

    if (!dEndPoint) return null;

    const src = buildImageUrl(dEndPoint, file, preset, custom);
    const imageAlt = alt || file.description || file.title || file.filename_download || '';

    return (
      <img
        key={idx}
        src={src}
        alt={imageAlt}
        className={className}
      />
    );
  });

  const validImages = renderItems.filter(Boolean);
  if (validImages.length === 0) return null;

  if (index === 'all') {
    return <>{validImages}</>;
  }

  return validImages[index] || validImages[0];
}


export default Image;
