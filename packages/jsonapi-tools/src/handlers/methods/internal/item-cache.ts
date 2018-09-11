import { IResourceObject } from 'jsonapi-types';

export type TypeItemCache = Map<string, Map<string, IResourceObject>>;

export function addToItemCache(itemCache: TypeItemCache, resource: IResourceObject) {
  let itemCacheWithType = itemCache.get(resource.type);
  if (!itemCacheWithType) {
    itemCacheWithType = new Map();
    itemCache.set(resource.type, itemCacheWithType);
  }
  itemCacheWithType.set(resource.id, resource);
}

export function itemCacheContains(itemCache: TypeItemCache, type: string, id: string) {
  const itemCacheWithType = itemCache.get(type);
  return itemCacheWithType && itemCacheWithType.has(id);
}
