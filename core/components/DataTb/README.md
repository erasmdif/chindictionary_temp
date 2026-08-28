# DataTb Component

A powerful, flexible data table component for Astro with support for multiple data sources, built on TanStack Table.

## Features

- 📊 **Multiple Data Sources**: CSV, JSON, Directus, and generic APIs
- 🔍 **Global Search**: Filter data across all columns
- ↕️ **Column Sorting**: Click headers to sort data
- 📄 **Pagination**: Built-in pagination with customizable page sizes
- 🎨 **Auto-detection**: Automatically detects columns from data
- ⚙️ **Customizable**: Override columns, formatting, and rendering
- 🎯 **TypeScript**: Full type safety
- 💅 **Tailwind Styled**: Beautiful default styling

## Basic Usage

### CSV Source

```jsx
import { DataTb } from '@core/components/DataTb';

<DataTb 
  source={{ type: 'csv', url: '/data/products.csv' }}
  searchable 
  pagination 
  client:idle 
/>
```

### JSON Source

```jsx
<DataTb 
  source={{
    type: 'json',
    data: [
      { name: 'Item 1', price: 10 },
      { name: 'Item 2', price: 20 }
    ]
  }}
  searchable
  client:idle
/>
```

### Directus Source

```jsx
import { directusConfig } from '@user/user.config.mjs';

<DataTb 
  source={{
    type: 'directus',
    collection: 'articles',
    config: directusConfig,
    filter: { status: { _eq: 'published' } },
    sort: ['-date_published']
  }}
  searchable 
  pagination 
  client:idle 
/>
```

### API Source

```jsx
<DataTb 
  source={{
    type: 'api',
    url: 'https://api.example.com/data',
    transformer: (data) => data.results
  }}
  searchable 
  pagination 
  client:idle 
/>
```

## Custom Columns

Override column display, formatting, and rendering:

```jsx
<DataTb 
  source={{ type: 'csv', url: '/data/products.csv' }}
  columns={[
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'name', header: 'Product Name', sortable: true },
    { key: 'price', header: 'Price', format: 'currency' },
    { key: 'date', header: 'Date', format: 'date' },
    { 
      key: 'status', 
      header: 'Status',
      render: (val) => val === 'active' ? '✅' : '❌'
    }
  ]}
  searchable
  pagination={{ pageSize: 20 }}
  initialSort={{ columnKey: 'name', direction: 'asc' }}
  client:idle
/>
```

## Props

### DataTb Component

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `ColumnConfig[]` | auto-detected | Column definitions |
| `searchable` | `boolean` | `false` | Enable global search |
| `pagination` | `boolean \| PaginationConfig` | `true` | Enable/configure pagination |
| `sortable` | `boolean` | `true` | Enable column sorting |
| `initialSort` | `{ columnKey, direction }` | - | Initial sort state |
| `className` | `string` | `''` | Custom CSS classes |
| `loadingMessage` | `string` | `'Loading data...'` | Loading message |
| `emptyMessage` | `string` | `'No data available'` | Empty state message |
| `errorMessage` | `string` | `'Error loading data'` | Error message |
| `truncateContent` | `boolean` | `true` | Truncate large cell content with ellipsis |
| `truncateMaxWidth` | `string` | `'20rem'` | Max width for truncated cell content |
| `contentSize` | `'sm' \| 'md'` | `'sm'` | Table body text size |

### Column Config

```typescript
{
  key: string;              // Data property key
  header: string;           // Display header text
  sortable?: boolean;       // Enable sorting (default: true)
  format?: 'date' | 'number' | 'currency' | 'percent';
  render?: (value, row) => ReactNode;  // Custom cell renderer
  width?: string;           // Column width (CSS value)
}
```

### Source Components

#### CsvSource

| Prop | Type | Description |
|------|------|-------------|
| `url` | `string` | CSV file URL (local or remote) |
| `delimiter` | `string` | Delimiter character (default: `','`) |
| `skipRows` | `number` | Skip first N rows |

#### JsonSource

| Prop | Type | Description |
|------|------|-------------|
| `data` | `DataRow[]` | Inline JSON data |
| `url` | `string` | URL to fetch JSON from |

#### DirectusSource

| Prop | Type | Description |
|------|------|-------------|
| `collection` | `string` | Collection name |
| `config` | `{ url, token }` | Directus configuration |
| `filter` | `object` | Directus filter query |
| `fields` | `string[]` | Fields to select |
| `sort` | `string[]` | Sort order (e.g., `['-date']`) |
| `limit` | `number` | Limit results |

#### ApiSource

| Prop | Type | Description |
|------|------|-------------|
| `url` | `string` | API endpoint URL |
| `method` | `'GET' \| 'POST'` | HTTP method (default: `'GET'`) |
| `headers` | `Record<string, string>` | Request headers |
| `body` | `any` | Request body (for POST) |
| `transformer` | `(data) => DataRow[]` | Transform response data |

## Formatting

Built-in formatters for common data types:

- `format: 'date'` - Formats dates (e.g., "Jan 10, 2026")
- `format: 'number'` - Formats numbers with thousands separators
- `format: 'currency'` - Formats as USD currency
- `format: 'percent'` - Formats as percentage

## Custom Rendering

Use the `render` function for complete control:

```jsx
columns={[
  {
    key: 'avatar',
    header: 'Avatar',
    render: (url) => <img src={url} alt="" className="w-10 h-10 rounded-full" />
  },
  {
    key: 'status',
    header: 'Status',
    render: (status, row) => (
      <span className={status === 'active' ? 'text-green-600' : 'text-red-600'}>
        {status}
      </span>
    )
  }
]}
```

## Directus Setup

1. Add configuration to `usr/user.config.mjs`:

```javascript
export const directusConfig = {
  url: 'https://your-directus-instance.com',
  token: 'your-access-token',
};
```

2. Generate a token in Directus admin panel:
   - Settings → Access Tokens → Create Token
   - Set appropriate permissions
   - Copy the token

3. Use in your component:

```jsx
import { directusConfig } from '@user/user.config.mjs';

<DataTb 
  source={{
    type: 'directus',
    collection: 'your_collection',
    config: directusConfig
  }}
  client:idle
/>
```

## Client Hydration

For optimal performance, use appropriate hydration strategies:

- `client:load` - For interactive tables (Directus, API, searchable)
- `client:idle` - For static data (CSV, JSON) - loads after initial page render
- `client:visible` - Load when table scrolls into view

```jsx
{/* Dynamic data - load immediately */}
<DataTb 
  source={{
    type: 'directus',
    collection: 'articles',
    config: directusConfig
  }}
  searchable 
  pagination 
  client:load 
/>

{/* Static data - load when idle */}
<DataTb 
  source={{ type: 'csv', url: '/data.csv' }}
  client:idle 
/>
```

## Architecture

The DataTb component follows a simple, self-contained architecture:

- **DataTb.tsx** - Main React component using TanStack Table with built-in data fetching
- **types.ts** - TypeScript definitions for all source types
- **utils.ts** - Helper functions for column detection, formatting

Data fetching is handled internally based on the `source` prop configuration, supporting CSV, JSON, Directus, and generic APIs.

## Examples

See the [DataTb Demo page](/datatable-demo) for live examples and more usage patterns.
