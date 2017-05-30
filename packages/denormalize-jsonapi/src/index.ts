import {
  IResourceIdentifierObject,
  IResourceObject,
  IDocumentBase,
  IResponseDocument,
  IErrorDocument,
  IResourceLinks,
  IRelationshipLinks,
  hasLinks,
  isSuccess,
  hasIncluded,
  IJSONValue
} from 'jsonapi-types';

function mapRelation(rel: IResourceIdentifierObject | null): string | null {
  if (rel) {
    return rel.id;
  }
  return null;
}

export interface IDenormalizedResource {
  id: string;
  type: string;
  [key: string]: IJSONValue;
}

function transformResource(
  res: IResourceObject, findIncluded: ResourceLookup, include?: Array<string | string[]>
): IDenormalizedResource {
  const attributes = res.attributes;
  const relationships = res.relationships;

  const out = res as IDenormalizedResource;

  for (const key of Object.keys(out)) {
    if (key !== 'id' && key !== 'type') {
      delete out[key];
    }
  }

  if (attributes) {
    for (const field of Object.keys(attributes)) {
      out[field] = attributes[field];
    }
  }

  if (relationships) {
    for (const field of Object.keys(relationships)) {
      const value = relationships[field];
      if (Array.isArray(value.data)) {
        if (!include || include.some(path => {
          return path === field || path[0] === field;
        })) {
          out[field] = value.data.map(findIncluded) as IJSONValue[];
        } else {
          out[field] = value.data.map(mapRelation);
        }
      } else if (!Array.isArray(value.data)) {
        if (!include || include.some(path => {
          return path === field || path[0] === field;
        })) {
          out[field] = findIncluded(value.data) as IJSONValue;
        } else {
          out[field] = mapRelation(value.data);
        }
      }
    }
  }
  return out;
}

interface IItemCache {
  [type: string]: {
    [id: string]:
    IResourceObject | IResourceIdentifierObject
  };
}

type ResourceLookup = (rel: IResourceIdentifierObject | null)
  => IResourceIdentifierObject | IResourceObject | string | null;

/*
* Uses linear search under 10000 items, and objects otherwise
*/
function createResourceLookup(
  resources: Array<IResourceObject | IResourceIdentifierObject>
): ResourceLookup {
  if (resources.length < 10000) {
    return (rel: IResourceIdentifierObject | null) => {
      if (!rel) {
        return null;
      }
      for (const item of resources) {
        if (item.id === rel.id && item.type === rel.type) {
          return item;
        }
      }
      return rel.id;
    };
  } else {
    const types: IItemCache = {};
    for (const item of resources) {
      let ids = types[item.type];
      if (!ids) {
        ids = types[item.type] = {};
      }
      ids[item.id] = item;
    }

    return (rel: IResourceIdentifierObject | null) => {
      if (!rel) {
        return null;
      }
      const ids = types[rel.type];
      return ids && ids[rel.id] || rel.id;
    };
  }
}

export interface IErrorWithData extends Error {
  message: 'JSONAPI error';
  data: IErrorDocument;
}

export interface IDenormalizedDocument extends IDocumentBase {
  data: IDenormalizedResource | IDenormalizedResource[] | null;
  links?: IResourceLinks | IRelationshipLinks;
}

/*
* top: http://jsonapi.org/format/#document-structure (object | null)
* include: http://jsonapi.org/format/#fetching-includes ((string | string[])[])
*/
export default function(
  top: IResponseDocument | null,
  include?: Array<string | string[]>
): IDenormalizedDocument | null {
  if (top) {
    const out: IDenormalizedDocument = { data: null };
    if (hasLinks(top)) {
      out.links = top.links;
    }
    if (top.jsonapi) {
      out.jsonapi = top.jsonapi;
    }
    if (top.meta) {
      out.meta = top.meta;
    }

    if (isSuccess(top)) {
      let resources: Array<IResourceObject | IResourceIdentifierObject> = [];
      resources = resources.concat(top.data || []);
      if (hasIncluded(top)) {
        resources = resources.concat(top.included || []);
      }

      const findIncluded = include ? createResourceLookup(resources) : mapRelation;

      if (hasIncluded(top) && top.included) {
        for (const item of top.included) {
          transformResource(item, findIncluded);
        }
        delete top.included;
      }

      if (top.data) {
        if (Array.isArray(top.data)) {
          for (const item of top.data) {
            transformResource(item, findIncluded, include);
          }
          out.data = top.data as IDenormalizedResource[];
        } else {
          transformResource(top.data, findIncluded, include);
          out.data = top.data as IDenormalizedResource;
        }
      }
      return out;
    } else {
      const error = new Error('JSONAPI error') as IErrorWithData;
      error.data = top;
      throw error;
    }
  }
  return null;
}
