# ZoteroGeoViewer Component

A React component that connects to a Zotero group library and visualizes items with geographical coordinates on a map, providing tag-based filtering and customizable layouts.

## Features

- **Zotero API Integration**: Fetches items directly from Zotero group libraries
- **Geographical Visualization**: Maps items to coordinates using tag-based georeferencing
- **Interactive Filtering**: Tag-based search with autocomplete functionality  
- **Flexible Layouts**: Multiple layout options for different use cases
- **Real-time Statistics**: Live counts of total, georeferenced, and filtered items
- **Recent Items Preview**: Quick access to the latest library additions

## Usage

### In Astro files

```astro
---
import { ZoteroGeoViewer } from '@core/components/ZoteroGeoViewer';
---

<ZoteroGeoViewer 
  groupId={12345}
  layout="8x4"
  mapHeight="500px"
  client:idle
/>
```

### In MDX files

```jsx
import { ZoteroGeoViewer } from '@core/components/ZoteroGeoViewer';

<ZoteroGeoViewer 
  groupId={12345}
  layout="6x6"
  tagAutocomplete={true}
  client:load
/>
```

### In React components

```tsx
import { ZoteroGeoViewer } from '@core/components/ZoteroGeoViewer';

export function MyPage() {
  return (
    <ZoteroGeoViewer
      groupId={12345}
      layout="vertical"
      mapCenter="20.5,40.0,8"
      maxItems={500}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `groupId` | `number` | **required** | Zotero group library ID |
| `layout` | `LayoutType` | `"8x4"` | Display layout configuration |
| `mapHeight` | `string` | `"600px"` | Height of the map container |
| `mapCenter` | `string` | `"20.5,40.0,8"` | Map center (lng,lat,zoom) |
| `tagAutocomplete` | `boolean` | `true` | Enable tag autocomplete |
| `maxItems` | `number` | `1000` | Maximum items to fetch |

### Layout Options

- **`vertical`**: Stacked layout (map top, controls bottom)
- **`6x6`**: Equal split (50/50) - good for detailed analysis
- **`8x4`**: Map focus (67/33) - emphasizes geographical view
- **`4x8`**: Controls focus (33/67) - emphasizes data and filtering
- **`12x4`**: Full-width map with controls below
- **`horizontal`**: Side-by-side layout

## Data Requirements

### Coordinate Data File

The component requires a GeoJSON file at `/data/zoteroTagCoordinates.geojson` with the following structure:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "Location Name",
        "altLabel": "Alternative Name",
        "id": 123,
        "source": "data_source"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [longitude, latitude]
      }
    }
  ]
}
```

### Tag-based Georeferencing

The component matches Zotero items to geographical locations by:

1. Extracting tags from each Zotero item
2. Matching tags against location names and alternative labels
3. Grouping items by matched coordinates
4. Creating map markers with item counts and popup details

## API Integration

### Zotero API

The component uses the public Zotero API:
- **Endpoint**: `https://api.zotero.org/groups/{groupId}/items`
- **Format**: JSON
- **Authentication**: None required for public groups
- **Rate Limits**: Respects Zotero's API limits

### Error Handling

- Network failures are gracefully handled with user feedback
- Invalid group IDs show appropriate error messages
- Missing coordinate data falls back to empty map

## Styling

The component uses Tailwind CSS classes and follows the s:CMS design system:

- **Color Scheme**: Blue for primary actions, gray for neutral elements
- **Responsive Design**: Adapts to mobile and desktop layouts
- **Interactive Elements**: Hover states and focus management
- **Loading States**: Spinner animation during data fetching

## Performance Considerations

- **Lazy Loading**: Component uses `client:idle` directive
- **Data Caching**: Fetched data persists during filter operations
- **Efficient Filtering**: Client-side filtering for tag queries
- **Map Optimization**: Uses MapLibre for performance

## Examples

### Basic Usage
```jsx
<ZoteroGeoViewer groupId={12345} client:load />
```

### Custom Configuration
```jsx
<ZoteroGeoViewer 
  groupId={12345}
  layout="6x6"
  mapHeight="400px"
  mapCenter="12.5,42.0,6"
  maxItems={500}
  tagAutocomplete={false}
  client:load
/>
```

### Vertical Layout for Narrow Spaces
```jsx
<ZoteroGeoViewer 
  groupId={12345}
  layout="vertical"
  mapHeight="300px"
  client:load
/>
```

## Dependencies

- **React**: Component framework
- **MapLibre GL**: Map rendering
- **Tailwind CSS**: Styling
- **Zotero API**: Data source
- **s:CMS Map Component**: Map integration

## Migration from Legacy sCMS

This component replaces the old `ZoteroGeoViewer.js` with:

1. **Modern React Hooks**: Uses functional components with hooks
2. **TypeScript Support**: Full type safety and IntelliSense
3. **s:CMS Integration**: Follows new component patterns
4. **Improved Performance**: Better data handling and rendering
5. **Enhanced UX**: Better loading states and error handling