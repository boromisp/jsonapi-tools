'use strict';

import dataToLinkage from './data-to-linkage';

import { ISchema, IResourceData } from '../../../types/model';
import { IResourceObject } from 'jsonapi-types';

import prefixedLinks from './prefixed-links';

export default function dataToResource(
  schema: ISchema, data: IResourceData, baseUrl: string | undefined): IResourceObject {
  const resource: IResourceObject = {
    type: schema.type,
    id: String(data.id)
  };

  const links = prefixedLinks(baseUrl, schema.links ? schema.links(data.id) : {
    self: `/${schema.type}/${data.id}`
  });

  if (links) {
    resource.links = links;
  }

  let attributes: IResourceObject['attributes'];
  let relationships: IResourceObject['relationships'];

  for (const key of Object.keys(data)) {
    const relatedSchema = schema.relationships && schema.relationships[key];
    if (relatedSchema) {
      if (!relationships) {
        relationships = {};
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
    resource.attributes = attributes;
  }
  if (relationships) {
    resource.relationships = relationships;
  }

  return resource;
}
