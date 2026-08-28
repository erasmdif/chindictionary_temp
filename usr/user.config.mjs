/**
 * User Configuration File
 * 
 * This file allows you to override core settings and customize your site.
 * Edit this file to configure your site's metadata, integrations, and more.
 * 
 * The settings here will be merged with the core configuration in astro.config.mjs
 */

export const userConfig = {
  // Site URL (required for sitemap and canonical URLs)
  site: 'https://scms.lad-sapienza.it',
  
  // Base path (if deploying to a subdirectory)
  // base: '/my-site',
  
  // Additional integrations (will be merged with core integrations)
  integrations: [
    // Add your custom integrations here
  ],
  
  // Custom Vite configuration
  vite: {
    // Your custom Vite config
  },
  
  // Markdown configuration overrides
  markdown: {
    // Your custom markdown config
  },
};

/**
 * Site Metadata
 * 
 * These values are used throughout the site for SEO, social media cards,
 * and general site information.
 */
export const siteMetadata = {
  title: 's:CMS',
  titleTemplate: '%s | s:CMS',
  description: 'Static Content Management System developed by LAD: Laboratorio di Archeologia Digitale alla Sapienza',
  author: 'Julian Bogdani <julian.bogdani@uniroma1.it>',
  siteName: 'LAD: Laboratorio di Archeologia Digitale alla Sapienza',
  defaultImage: '/images/scms-lad.png',
  twitter: '@JulianBogdani',
};

/**
 * Directus Configuration
 * 
 * DEPRECATED: No longer needed! 
 * 
 * Map and DataTb components now automatically read from environment variables:
 * - PUBLIC_DIRECTUS_URL
 * - PUBLIC_DIRECTUS_TOKEN
 * 
 * Simply create a .env file in your project root:
 * 
 * PUBLIC_DIRECTUS_URL=https://your-directus-instance.com
 * PUBLIC_DIRECTUS_TOKEN=your-token-here
 * 
 * Then use the simplified interface:
 * 
 * <DataTb 
 *   directus={{
 *     table: "your_collection",
 *     queryString: "filter[status][_eq]=published"
 *   }}
 * />
 * 
 * <Map 
 *   directus={{
 *     table: "your_collection",
 *     geoField: "geometry",
 *     queryString: "filter[visible][_eq]=true"
 *   }}
 * />
 */
