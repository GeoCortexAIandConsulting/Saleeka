import { join, resolve } from 'node:path';

/** Where raw brand catalogs and cached pages live (inside the project, on its drive). Override with CATALOG_CACHE. */
export const CACHE_DIR = resolve(process.env.CATALOG_CACHE ?? join(process.cwd(), '.catalog-cache'));
