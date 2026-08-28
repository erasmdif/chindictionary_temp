
import { Source, Layer } from '@vis.gl/react-maplibre';

interface RasterLayerProps {
  url: string[];
  attribution?: string;
  tileSize?: number;
  id?: string;
  beforeId?: string;
  visible?: boolean;
}

export function RasterLayerLibre({ url, attribution, tileSize = 256, id = 'base-layer', beforeId, visible = true }: RasterLayerProps) {
  return (
    <Source 
      id={`source-${id}`}
      type="raster" 
      tiles={url} 
      tileSize={tileSize}
      attribution={attribution}
    >
      <Layer 
        id={id}
        type="raster"
        paint={{}}
        beforeId={beforeId}
        layout={{
          visibility: visible ? 'visible' : 'none'
        }}
      />
    </Source>
  );
}
