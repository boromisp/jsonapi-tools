'use strict';

import dataToLinkage from './data-to-linkage';

import { ISchema, IResourceData } from '../../../types/model';
import { IResourceObject } from 'jsonapi-types';

export default function dataToResource(schema: ISchema, data: IResourceData | null): IResourceObject | null {
  if (!data) {
    return null;
  }

  const resource: IResourceObject = {
    links: schema.links ? schema.links(data.id) : {
      self: `/${schema.type}/${data.id}`
    },
    type: schema.type,
    id: String(data.id)
  };

  let attributes: IResourceObject['attributes'];
  let relationships: IResourceObject['relationships'];

  for (const key of Object.keys(data)) {
    const relatedSchema = schema.relationships && schema.relationships[key];
    if (relatedSchema) {
      if (!relationships) {
        relationships = {};
      }
      relationships[key] = dataToLinkage(relatedSchema, data[key], schema.type, data.id, key);
    } else if (key !== 'id' && key !== 'type') {
      if (!attributes) {
        attributes = {};
      }
      attributes[key] = data[key];
    }
  }

  if (attributes) {
    resource.attributes = attributes;
  }
  if (relationships) {
    resource.relationships = relationships;
  }

  return resource;
}
