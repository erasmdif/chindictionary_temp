const rawBase = import.meta.env.BASE_URL || '/';

export const CHIND_BASE_PATH = rawBase === '/' ? '' : rawBase.replace(/\/+$/, '');

export function withBase(path = '/'): string {
  if (!path) return CHIND_BASE_PATH || '/';
  if (
    path.startsWith('#') || path.startsWith('?') || path.startsWith('mailto:') ||
    path.startsWith('tel:') || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')
  ) return path;

  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!CHIND_BASE_PATH) return normalized;
  if (normalized === '/') return `${CHIND_BASE_PATH}/`;
  if (normalized === CHIND_BASE_PATH || normalized.startsWith(`${CHIND_BASE_PATH}/`)) return normalized;
  return `${CHIND_BASE_PATH}${normalized}`;
}

export function withoutBase(pathname: string): string {
  const value = pathname || '/';
  if (!CHIND_BASE_PATH) return value;
  if (value === CHIND_BASE_PATH) return '/';
  if (value.startsWith(`${CHIND_BASE_PATH}/`)) return value.slice(CHIND_BASE_PATH.length) || '/';
  return value;
}
