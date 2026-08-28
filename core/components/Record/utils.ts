export function getValueByDotPath(data: any, path: string): any {
  if (!data || !path) return undefined;

  return path.split('.').reduce((current, segment) => {
    if (current == null) return undefined;

    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      return current[Number(segment)];
    }

    return current[segment];
  }, data);
}
