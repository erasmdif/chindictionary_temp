/**
 * Default Basemap configurations
 * Based on https://github.com/lad-sapienza/sCMS/blob/main/src/modules/maps/defaultBaseLayers.js
 */

import type { BaseLayerConfig } from './types';

export const defaultBasemaps: Record<string, BaseLayerConfig> = {
  CAWM: {
    name: "Ancient World Map",
    url: "https://cawm.lib.uiowa.edu/tiles/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="http://cawm.lib.uiowa.edu/index.html">Consortium of Ancient World Mappers</a>',
  },
  OSM: {
    name: "Open Street Map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  EsriSatellite: {
    name: "Esri Imagery/Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
  EsriStreets: {
    name: "Esri Streets",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  },
  EsriTopo: {
    name: "Esri Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  },
  GoogleSatellite: {
    name: "Google Satellite",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  },
  GoogleRoadmap: {
    name: "Google Roadmap",
    url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
  },
  GoogleTerrain: {
    name: "Google Terrain",
    url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
  },
  GoogleAlteredRoadmap: {
    name: "Google Altered Roadmap",
    url: "https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}",
  },
  CartoDB: {
    name: "CartoDB",
    url: "https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
  },
  StamenTerrain: {
    name: "Stamen Terrain",
    url: "https://a.tile.stamen.com/terrain/{z}/{x}/{y}.png",
  },
  OSMMapnick: {
    name: "OpenStreetMap Mapnick",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  OSMCycle: {
    name: "OSM Cycle Map",
    url: "https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png",
  },
  Imperium: {
    name: "Imperium (DARE)",
    url: "https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png",
  }
};

/**
 * Valid basemap keys
 */
export type BasemapKey = keyof typeof defaultBasemaps;

/**
 * Get basemap configuration by key
 */
export function getBasemap(key: string): BaseLayerConfig | undefined {
  return defaultBasemaps[key];
}

/**
 * Get multiple basemaps by keys
 */
export function getBasemaps(keys: string[]): BaseLayerConfig[] {
  return keys
    .map(key => defaultBasemaps[key])
    .filter((config): config is BaseLayerConfig => config !== undefined);
}
