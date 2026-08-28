import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Layers, Search, X } from 'lucide-react';
import type { IControl } from 'maplibre-gl';
import type { BaseLayerConfig, VectorLayerConfig, ControlPosition, SearchInFields, SearchQuery } from './types';
import { SearchUI } from './Search';

export interface LayerControlProps {
  baseLayers?: BaseLayerConfig[];
  activeBaseLayer?: number;
  onBaseLayerChange?: (index: number) => void;
  vectorLayers?: Array<VectorLayerConfig & { id: string }>;
  vectorLayerVisibility?: Record<string, boolean>;
  onVectorLayerToggle?: (layerId: string) => void;
  onLayerSearch?: (layerId: string, query: SearchQuery) => void;
  layerSearchQueries?: Record<string, SearchQuery>;
  position?: ControlPosition;
}

// Internal React component for the control UI
function LayerControlUI({ 
  baseLayers = [], 
  activeBaseLayer = 0, 
  onBaseLayerChange,
  vectorLayers = [],
  vectorLayerVisibility = {},
  onVectorLayerToggle,
  onLayerSearch,
  layerSearchQueries = {},
}: Omit<LayerControlProps, 'position'>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchModal, setSearchModal] = useState<{isOpen: boolean, layerId: string, layerName: string, fieldList: SearchInFields, currentQuery?: SearchQuery} | null>(null);
  const radioGroupId = React.useId();
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const hasContent = baseLayers.length > 0 || vectorLayers.length > 0;
  if (!hasContent) return null;

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 300);
  };

  const handleSearchClick = (layerId: string, layerName: string, searchInFields: SearchInFields) => {
    // Prevent layout shift by preserving scrollbar space
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    
    setSearchModal({
      isOpen: true,
      layerId,
      layerName,
      fieldList: searchInFields,
      currentQuery: layerSearchQueries[layerId]
    });
  };

  const handleSearchClose = () => {
    setSearchModal(null);
    
    // Defer body style restoration until after React re-render
    setTimeout(() => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }, 0);
  };

  const handleSearch = (query: SearchQuery) => {
    if (searchModal && onLayerSearch) {
      onLayerSearch(searchModal.layerId, query);
    }
    handleSearchClose();
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Cleanup: restore body styles if component unmounts with modal open
      if (searchModal?.isOpen) {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }
    };
  }, [searchModal?.isOpen]);

  // Prevent re-render position shifts by using useLayoutEffect for immediate cleanup
  useLayoutEffect(() => {
    if (!searchModal?.isOpen) {
      // Ensure body styles are restored immediately after modal closes
      const timeoutId = setTimeout(() => {
        if (document.body.style.overflow === 'hidden') {
          document.body.style.overflow = '';
          document.body.style.paddingRight = '';
        }
      }, 50); // Small delay to let React finish re-rendering

      return () => clearTimeout(timeoutId);
    }
  }, [searchModal?.isOpen, layerSearchQueries]);

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ position: 'relative' }}>
      <div 
        style={{ 
          padding: '8px', 
          fontWeight: 600, 
          userSelect: 'none', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          minHeight: '32px',
          minWidth: '32px',
          background: 'white',
          borderRadius: '4px',
          position: 'relative',
          zIndex: 1
        }}
      >
        {!isExpanded && <Layers className="scms-icon scms-icon-lg" />}
      </div>
      
      {isExpanded && (
        <div style={{ 
          position: 'absolute',
          top: 0,
          right: 0,
          backgroundColor: 'white',
          borderRadius: '4px',
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          padding: '8px 12px 12px 12px', 
          minWidth: 180,
          maxWidth: 250,
          zIndex: 1000,
          whiteSpace: 'nowrap'
        }}>
          
          {/* Vector Layers Section */}
          {vectorLayers.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {vectorLayers.map((layer) => (
                <div key={layer.id} style={{ marginBottom: 6, display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={`vector-layer-${layer.id}`}
                    checked={vectorLayerVisibility[layer.id] !== false}
                    onChange={() => onVectorLayerToggle?.(layer.id)}
                    style={{ marginRight: 8, cursor: 'pointer' }}
                  />
                  <label 
                    htmlFor={`vector-layer-${layer.id}`}
                    style={{ cursor: 'pointer', fontSize: '12px', userSelect: 'none', flex: 1 }}
                  >
                    {layer.name}
                  </label>
                  {layer.searchInFields && Object.keys(layer.searchInFields).length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSearchClick(layer.id, layer.name, layer.searchInFields!)}
                      className={`scms-btn-icon scms-btn-sm ${
                        layerSearchQueries[layer.id]?.filters?.length ? 'active' : ''
                      }`}
                      title={`Search ${layer.name}${layerSearchQueries[layer.id]?.filters?.length ? ' (Active)' : ''}`}
                    >
                      <Search className="scms-icon scms-icon-sm" />
                    </button>
                  )}
                </div>
              ))}
              {baseLayers.length > 0 && <hr style={{ margin: '8px 0', borderColor: '#eee' }} />}
            </div>
          )}

          {/* Base Layers Section */}
          {baseLayers.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#666', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                Base Maps
              </div>
              {baseLayers.map((layer, index) => {
                const isChecked = index === activeBaseLayer;
                return (
                  <div key={`${layer.name}-${index}`} style={{ marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                    <input
                      type="radio"
                      id={`base-layer-${radioGroupId}-${index}`}
                      name={`base-layer-select-${radioGroupId}`}
                      value={index}
                      checked={isChecked}
                      onChange={() => onBaseLayerChange?.(index)}
                      style={{ 
                        marginRight: 8, 
                        cursor: 'pointer',
                        width: '16px',
                        height: '16px',
                        accentColor: '#3b82f6'
                      }}
                    />
                    <label 
                      htmlFor={`base-layer-${radioGroupId}-${index}`}
                      style={{ cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}
                    >
                      {layer.name}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Search Modal */}
      {searchModal?.isOpen && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            overflowY: 'auto'
          }}
          onClick={handleSearchClose}
        >
          <div
            className="bg-white rounded shadow"
            style={{ maxHeight: 'calc(100vh - 4rem)', width: '500px', maxWidth: '90vw', margin: '2rem 1rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
              <h3 className="h5 fw-semibold mb-0 d-flex align-items-center gap-2 flex-grow-1 pe-2">
                <Search className="scms-icon scms-icon-md" />
                Search {searchModal.layerName}
              </h3>
              <button
                onClick={handleSearchClose}
                className="btn btn-sm btn-light flex-shrink-0"
                aria-label="Close modal"
              >
                <X className="scms-icon scms-icon-md" />
              </button>
            </div>
            
            <div className="p-3" style={{ overflowY: 'auto' }}>
              <SearchUI
                fieldList={searchModal.fieldList}
                onSearch={handleSearch}
                currentQuery={searchModal.currentQuery}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// MapLibre IControl wrapper
export class LayerControlClass implements IControl {
  private container: HTMLDivElement | undefined;
  private root: Root | undefined;
  private props: Omit<LayerControlProps, 'position'>;
  private isAddedToMap: boolean = false;

  constructor(props: Omit<LayerControlProps, 'position'>) {
    this.props = props;
  }

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    
    this.root = createRoot(this.container);
    this.root.render(<LayerControlUI {...this.props} />);
    this.isAddedToMap = true;
    
    return this.container;
  }

  onRemove(): void {
    if (this.root) {
      this.root.unmount();
      this.root = undefined;
    }
    if (this.container) {
      this.container.remove();
    }
    this.container = undefined;
    this.isAddedToMap = false;
  }

  updateProps(newProps: Omit<LayerControlProps, 'position'>): void {
    // Only update if the control is actually added to the map and props have changed
    if (!this.isAddedToMap || !this.root) {
      this.props = newProps;
      return;
    }

    // Compare props to avoid unnecessary re-renders
    const hasChanged = 
      JSON.stringify(this.props.layerSearchQueries) !== JSON.stringify(newProps.layerSearchQueries) ||
      JSON.stringify(this.props.vectorLayerVisibility) !== JSON.stringify(newProps.vectorLayerVisibility) ||
      this.props.activeBaseLayer !== newProps.activeBaseLayer;

    if (hasChanged) {
      this.props = newProps;
      // Use requestAnimationFrame to ensure the update happens after current execution
      requestAnimationFrame(() => {
        if (this.root && this.isAddedToMap) {
          this.root.render(<LayerControlUI {...this.props} />);
        }
      });
    }
  }
}

// React component wrapper for use in @vis.gl/react-maplibre
export function LayerControl(props: LayerControlProps) {
  const controlRef = useRef<LayerControlClass | null>(null);
  const previousPropsRef = useRef<LayerControlProps | undefined>(undefined);

  // Only update if props have actually changed
  useEffect(() => {
    if (controlRef.current && previousPropsRef.current) {
      const { position, ...restProps } = props;
      const { position: prevPosition, ...prevRestProps } = previousPropsRef.current;
      
      // Only call updateProps if relevant props changed
      if (JSON.stringify(restProps) !== JSON.stringify(prevRestProps)) {
        controlRef.current.updateProps(restProps);
      }
    }
    previousPropsRef.current = props;
  }, [props.layerSearchQueries, props.vectorLayerVisibility, props.activeBaseLayer]);

  // Create control instance only once
  if (!controlRef.current) {
    const { position, ...restProps } = props;
    controlRef.current = new LayerControlClass(restProps);
  }

  // Return a placeholder that react-maplibre can recognize
  // The actual control is added via map.addControl in Map.tsx
  return null;
}

// Export the control class for direct use
export { LayerControlClass as LayerControlIControl };
