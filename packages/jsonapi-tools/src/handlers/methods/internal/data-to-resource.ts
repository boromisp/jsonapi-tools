'use strict';

import dataToLinkage from './data-to-linkage';

import { ISchema, IResourceData } from '../../../types/model';
import { IResourceObject } from 'jsonapi-types';

import prefixedLinks from './prefixed-links';
import { TypeItemCache, addToItemCache } from './item-cache';
import CustomError from '../../../utils/custom-error';

function isRelationshipObject(data: object) {
  const keys = Object.keys(data);
  const keysStr = JSON.stringify(keys.sort());
  return keys.length === 1 && keysStr === '["id"]'
    || keys.length === 2 && keysStr === '["id","meta"]';
}

function relatedDataIsOnlyID(data: any) {
  return data === null
    || typeof data === 'string' || typeof data === 'number'
    || typeof data === 'object' && isRelationshipObject(data);
}

export default function dataToResource(
  schema: ISchema,
  data: IResourceData,
  itemCache: TypeItemCache | null,
  baseUrl?: string
): IResourceObject {
  const object: IResourceObject = {
    type: schema.type,
    id: String(data.id)
  };

  const links = prefixedLinks(baseUrl, schema.links ? schema.links(data.id) : {
    self: `/${schema.type}/${data.id}`
  });

  if (links) {
    object.links = links;
  }

  let attributes: IResourceObject['attributes'];
  let relationships: IResourceObject['relationships'];

  for (const key of Object.keys(data)) {
    const relatedSchema = schema.relationships && schema.relationships[key];
    if (relatedSchema) {
      if (!relationships) {
        relationships = {};
      }
      if (relatedSchema.array) {
        if (data[key] !== null && !Array.isArray(data[key])) {
          throw new CustomError(`Programmer error: ${schema.type}.${key} should be any array.`, 500);
        }
      } else if (Array.isArray(data[key])) {
        throw new CustomError(`Programmer error: ${schema.type}.${key} should not be any array.`, 500);
      }
      if (itemCache) {
        if (Array.isArray(data[key])) {
          if (data[key].length > 0 && !relatedDataIsOnlyID(data[key][0])) {
            for (const item of data[key]) {
              addToItemCache(itemCache, dataToResource(relatedSchema.getModel().schema, item, itemCache, baseUrl));
            }
          }
        } else if (!relatedDataIsOnlyID(data[key])) {
          addToItemCache(itemCache, dataToResource(relatedSchema.getModel().schema, data[key], itemCache, baseUrl));
        }
      }
      relationships[key] = dataToLinkage(relatedSchema, data[key], schema.type, data.id, key);
    } else if (key !== 'id' && key !== 'type' && key !== '__count') {
      if (!attributes) {
        attributes = {};
      }
      attributes[key] = data[key];
    }
  }

  if (attributes) {
    object.attributes = attributes;
  }
  if (relationships) {
    object.relationships = relationships;
  }

  return object;
}
