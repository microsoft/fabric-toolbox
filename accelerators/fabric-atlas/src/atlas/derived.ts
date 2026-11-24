import type { AtlasData } from "./model";

const cache = new WeakMap<AtlasData, Map<string, unknown>>();

export function derivedFromSnapshot<T>(
  data: AtlasData,
  key: string,
  build: (data: AtlasData) => T,
): T {
  let values = cache.get(data);
  if (!values) {
    values = new Map();
    cache.set(data, values);
  }
  if (values.has(key)) return values.get(key) as T;
  const value = build(data);
  values.set(key, value);
  return value;
}
