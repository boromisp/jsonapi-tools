'use strict';

import * as bluebird from 'bluebird';
import { Writable } from 'stream';

import getRelatedSchema from './internal/get-related-schema';
import modelForType from './internal/model-for-type';
import dataToLinkage from './internal/data-to-linkage';
import dataToResource from './internal/data-to-resource';

import CustomError from '../../utils/custom-error';

import { IModel, IModels } from '../../types/model';
import { ISuccessResponseObject } from '../../types/utils';

import { IRequestParamsBase } from './types/request-params';

import {
  IResourceObject,
  IRelationshipObject,
  ISuccessResourceDocument,
  IResourceIdentifierObject,
  IJSONObject
} from 'jsonapi-types';
import { IParsedQueryFields, IParsedIncludes } from '../../types/utils';

import prefixedLinks from './internal/prefixed-links';

type IGetRest = Pick<IGetRequestParamsBase, 'method' | 'options'>;

function getResource(
  model: IModel,
  id: string,
  fields: IParsedQueryFields | null,
  rest: IGetRest,
  baseUrl: string | undefined
): PromiseLike<IResourceObject | null> {
  return model.getOne(Object.assign({
    id,
    fields: fields && fields[model.schema.type]
  }, rest)).then(data => data ? dataToResource(model.schema, data, baseUrl) : null);
}

interface IResourceObjects extends Array<IResourceObject> {
  $count?: number;
}

function getResources(
  model: IModel,
  ids: string[] | null,
  fields: IParsedQueryFields | null,
  filters: object | null,
  sorts: string[] | null,
  page: object | null,
  rest: IGetRest,
  baseUrl: string | undefined
): PromiseLike<IResourceObjects> {
  if (ids === null) {
    return model.getAll(Object.assign({
      fields: fields && fields[model.schema.type],
      filters,
      sorts,
      page
    }, rest)).then(data => {
      const resources: IResourceObjects = data.map(item => dataToResource(model.schema, item, baseUrl));
      if (data.length && data[0].__count) {
        resources.$count = data[0].__count;
      }
      return resources;
    });
  } else {
    return model.getSome(Object.assign({
      ids,
      fields: fields && fields[model.schema.type],
      filters,
      sorts,
      page
    }, rest)).then(data => {
      if (data) {
        const resources: IResourceObjects = data.map(item => dataToResource(model.schema, item, baseUrl));
        if (data.length && data[0].__count) {
          resources.$count = data[0].__count;
        }
        return resources;
      }
      return [];
    });
  }
}

function getRelationshipObject(
  model: IModel,
  id: string,
  relationship: string,
  fields: IParsedQueryFields | null,
  rest: IGetRest): PromiseLike<IRelationshipObject> {

  return bluebird.try(() => {
    const relatedSchema = getRelatedSchema(model.schema, relationship);
    const type = model.schema.type;
    const localFields = fields && fields[type] || new Set();
    localFields.add(relationship);

    return model.getOne(Object.assign({ id, fields: localFields }, rest)).then(data => {
      if (data) {
        return dataToLinkage(relatedSchema, data[relationship], type, id, relationship);
      }
      throw new CustomError(`Parent object for relationship ${type}(${id}).${relationship} not found.`, 404);
    });
  });
}

function validateIncludes(models: IModels, type: string, includes: IParsedIncludes) {
  const relationships = models[type].schema.relationships || {};
  for (const relationship of Object.keys(includes)) {
    if (!relationships[relationship]) {
      throw new CustomError(`Invalid include. Type ${type} has no relationship named ${relationship}.`, 400);
    }
    validateIncludes(models, relationships[relationship].type, includes[relationship]);
  }
}

type TypeLinkMap = Map<string, Set<string>>;

function buildLinkMap(links: Array<IResourceObject | IResourceIdentifierObject>, linkMap: TypeLinkMap = new Map()) {
  for (const link of links) {
    let linkMapWithType = linkMap.get(link.type);
    if (!linkMapWithType) {
      linkMapWithType = new Set();
      linkMap.set(link.type, linkMapWithType);
    }
    linkMapWithType.add(link.id);
  }
  return linkMap;
}

function uniqueLinks(links: Array<IResourceObject | IResourceIdentifierObject>): IResourceIdentifierObject[] {
  const out: Array<{ type: string, id: string }> = [];
  for (const [type, ids] of buildLinkMap(links)) {
    for (const id of ids) {
      out.push({ type, id });
    }
  }
  return out;
}

type TypeItemCache = Map<string, Map<string, IResourceObject>>;

function addToItemCache(itemCache: TypeItemCache, resource: IResourceObject) {
  let itemCacheWithType = itemCache.get(resource.type);
  if (!itemCacheWithType) {
    itemCacheWithType = new Map();
    itemCache.set(resource.type, itemCacheWithType);
  }
  itemCacheWithType.set(resource.id, resource);
}

function itemCacheContains(itemCache: TypeItemCache, type: string, id: string) {
  const itemCacheWithType = itemCache.get(type);
  return itemCacheWithType && itemCacheWithType.has(id);
}

function includeTier(
  models: IModels,
  fields: IParsedQueryFields | null,
  tierNodes: IParsedIncludes[],
  itemCache: TypeItemCache,
  includeNodeLinks: Map<IParsedIncludes, IResourceObject[]>,
  rest: IGetRest,
  baseUrl: string | undefined,
  out?: Writable,
  some?: boolean): PromiseLike<void> {
  return bluebird.try(() => {
    const tierLinks: TypeLinkMap = new Map();

    for (const node of tierNodes) {
      // TODO: includeNodeLinks.get(node) what if not found?
      const nodeParents = includeNodeLinks.get(node)!.map(identifier => {
        const resourcesWithType = itemCache.get(identifier.type);
        if (resourcesWithType) {
          const parent = resourcesWithType.get(identifier.id);
          if (parent) {
            return parent;
          }
        }
        throw new Error('Parent node missing with type: ' + identifier.type + ' and id: ' + identifier.id + '.');
      }).filter(Boolean);

      for (const relationship of Object.keys(node)) {
        const nodeLinks = uniqueLinks(nodeParents.reduce((links: IResourceIdentifierObject[], resource) => {
          if (resource.relationships && resource.relationships[relationship]) {
            const relationshipData = resource.relationships[relationship].data;
            if (relationshipData) {
              if (Array.isArray(relationshipData)) {
                return links.concat(relationshipData.filter(data => data.id != null));
              } else if (relationshipData.id != null) {
                links.push(relationshipData);
              }
            }
          }
          return links;
        }, []));
        includeNodeLinks.set(node[relationship], nodeLinks);
        buildLinkMap(nodeLinks, tierLinks);
      }
    }

    const newLinks = [...tierLinks].reduce((links: Array<[IModel, string[]]>, [type, ids]) => {
      const newIDs = [...ids].filter(id => !itemCacheContains(itemCache, type, id));
      if (newIDs.length > 0) {
        links.push([modelForType(models, type), newIDs]);
      }
      return links;
    }, []);

    const promises = newLinks.map(([model, ids]) => getResources(model, ids, fields, null, null, null, rest, baseUrl));
    return bluebird.all(promises);
  }).then(resourceArrays => {
    for (const resources of resourceArrays) {
      for (const resource of resources) {
        if (out) {
          if (!some) {
            out.write(`,"included":[`);
            some = true;
          } else {
            out.write(',');
          }
          out.write(JSON.stringify(resource));
        }
        addToItemCache(itemCache, resource);
      }
    }

    const nextTierNodes = tierNodes.reduce((nodes: IParsedIncludes[], node) => {
      for (const relationship of Object.keys(node)) {
        if (Object.keys(node[relationship]).length) {
          nodes.push(node[relationship]);
        }
      }
      return nodes;
    }, []);

    if (nextTierNodes.length === 0) {
      if (out && some) {
        out.write(']');
      }
      return;
    }

    return includeTier(models, fields, nextTierNodes, itemCache, includeNodeLinks, rest, baseUrl, out, some);
  });
}

function getIncludedResources(
  models: IModels,
  primary: IResourceObject[],
  fields: IParsedQueryFields | null,
  includes: IParsedIncludes,
  rest: IGetRest,
  baseUrl: string | undefined,
  out?: Writable
): PromiseLike<IResourceObject[]> {
  return bluebird.try(() => {
    const primaryType = primary[0].type;

    validateIncludes(models, primaryType, includes);

    const itemCache: TypeItemCache = new Map();
    for (const resource of primary) {
      addToItemCache(itemCache, resource);
    }

    const includeNodeLinks: Map<IParsedIncludes, IResourceObject[]> = new Map();
    includeNodeLinks.set(includes, primary);

    return includeTier(models, fields, [includes], itemCache, includeNodeLinks, rest, baseUrl, out).then(() => {
      const included: IResourceObject[] = [];
      // TODO: what if includeNodeLinks doesn't contain includes?
      const primaryLinks = buildLinkMap(includeNodeLinks.get(includes)!);

      for (const [type, ids] of itemCache) {
        for (const [id, resource] of ids) {
          const primaryLinksWithType = primaryLinks.get(type);
          if (!primaryLinksWithType || !primaryLinksWithType.has(id)) {
            included.push(resource);
          }
        }
      }

      return included;
    });
  });
}

export interface IGetRequestParamsBase extends IRequestParamsBase {
  method: 'get';
  type: string;
  models: IModels;
}

export interface IGetOneRequestParams extends IGetRequestParamsBase {
  id: string;
  fields: IParsedQueryFields | null;
  includes: IParsedIncludes | null;
}

export interface IGetAllRequestParams extends IGetRequestParamsBase {
  filters: object | null;
  sorts: string[] | null;
  fields: IParsedQueryFields | null;
  includes: IParsedIncludes | null;
  page: object | null;
}

export interface IGetRelationshipRequestParams extends IGetRequestParamsBase {
  id: string;
  relationship: string;
  asLink: true;
  page: object | null;
}

export interface IGetRelatedResourceRequestParams extends IGetAllRequestParams {
  id: string;
  relationship: string;
  asLink: false;
}

export type IGetRequestParams = IGetOneRequestParams
  | IGetAllRequestParams
  | IGetRelationshipRequestParams
  | IGetRelatedResourceRequestParams;

function isGetOneRequest(request: IGetRequestParams): request is IGetOneRequestParams {
  return (request as IGetOneRequestParams).id !== undefined;
}

export function isRelatedRequest(
  request: IGetRequestParams
): request is IGetRelationshipRequestParams | IGetRelatedResourceRequestParams {
  return isGetOneRequest(request)
    && (request as IGetRelationshipRequestParams | IGetRelatedResourceRequestParams).relationship !== undefined;
}

function includeRelatedResources(
  requestParams: IGetOneRequestParams | IGetAllRequestParams | IGetRelatedResourceRequestParams,
  top: ISuccessResourceDocument,
  out?: Writable
): PromiseLike<ISuccessResourceDocument> {
  const { models, fields, includes, options, method, baseUrl } = requestParams;
  const rest = { options, method};

  if (includes && top.data && (!Array.isArray(top.data) || top.data.length)) {
    const primary = Array.isArray(top.data) ? top.data : [top.data];
    return getIncludedResources(models, primary, fields, includes, rest, baseUrl, out).then(included => {
      if (out) {
        return top;
      }
      if (included.length) {
        top.included = included;
      }
      return top;
    });
  }
  return bluebird.resolve(top);
}

function getRelatedResourceDocument(
  requestParams: IGetRelatedResourceRequestParams, out?: Writable
): PromiseLike<void|ISuccessResourceDocument> {
  const { models, type, fields, options, page, method, filters, sorts, id, relationship, baseUrl } = requestParams;
  const rest = { options, method};

  return bluebird.try(() => modelForType(models, type))
    .then(model => getRelationshipObject(model, id, relationship, null, rest))
    .then(relationshipObject => {
      const top: ISuccessResourceDocument = { data: null };
      const relatedLink = relationshipObject.links && relationshipObject.links.related;
      if (relatedLink) {
        top.links = { self: relatedLink };
      }
      if (Array.isArray(relationshipObject.data)) {
        if (relationshipObject.data.length) {
          return getResources(
            modelForType(models, relationshipObject.data[0].type),
            relationshipObject.data.map(item => item.id),
            fields, filters, sorts, page,
            rest,
            baseUrl
          ).then(data => {
            top.data = data;
            if (typeof data.$count !== 'undefined') {
              top.meta = { count: data.$count || data.length };
            }
            return top;
          });
        }
        top.data = [];
      } else if (relationshipObject.data) {
        return getResource(
          modelForType(models, relationshipObject.data.type),
          relationshipObject.data.id,
          fields,
          rest,
          baseUrl
        ).then(data => { top.data = data; return top; });
      }
      return top;
    }).then(top => includeRelatedResources(requestParams, top))
    .then(top => out ? bluebird.fromCallback(callback => out.write(JSON.stringify(top), callback)) : top);
}

function getRelationshipDocument(
  requestParams: IGetRelationshipRequestParams, out?: Writable
): PromiseLike<void|ISuccessResourceDocument> {
  const { models, type, options, page, method, id, relationship } = requestParams;
  const rest = { options, page, method};

  return bluebird.try(() => modelForType(models, type))
    .then(model => getRelationshipObject(model, id, relationship, null, rest))
    .then(top => out ? bluebird.fromCallback(callback => out.write(JSON.stringify(top), callback)) : top);
}

function getResourceDocument(
  requestParams: IGetOneRequestParams, out?: Writable): PromiseLike<void|ISuccessResourceDocument> {
  const { models, type, fields, options, method, baseUrl } = requestParams;
  const rest = { options, method};

  return bluebird.try(() => modelForType(models, type))
    .then(model => getResource(model, requestParams.id, fields, rest, baseUrl))
    .then(resource => {
      if (!resource) {
        throw new CustomError(`Item of type ${type} with id ${requestParams.id} not found.`, 404);
      }
      const top: ISuccessResourceDocument = { data: resource };
      if (resource.links) {
        top.links = { self: resource.links.self };
      }
      return includeRelatedResources(requestParams, top);
    })
    .then(top => out ? bluebird.fromCallback(callback => out.write(JSON.stringify(top), callback)) : top);
}

function getResourcesDocument(
  requestParams: IGetAllRequestParams, out?: Writable): PromiseLike<void|ISuccessResourceDocument> {
  const { models, type, fields, options, page, method, baseUrl } = requestParams;
  const rest = { options, page, method};

  return bluebird.try(() => modelForType(models, type))
    .then((model: IModel) => getResources(
      model, null, fields, requestParams.filters, requestParams.sorts, page, rest, baseUrl)
      .then(resources => {
        const count = resources.$count;
        delete resources.$count;

        const links = prefixedLinks(
          requestParams.baseUrl,
          model.schema.links ? model.schema.links() : { self: `/${type}` }
        );

        const meta: IJSONObject | undefined = count === undefined ? undefined : { count: count || resources.length };

        if (!out) {
          const top: ISuccessResourceDocument = {
            data: resources
          };

          if (links) {
            top.links = links;
          }

          if (meta) {
            top.meta = meta;
          }
          return includeRelatedResources(requestParams, top);
        }

        if (links) {
          out.write(`{"links":${JSON.stringify(links)}`);
        } else {
          out.write('{');
        }

        out.write(JSON.stringify(resources));
        if (meta) {
          out.write(`,"meta":${JSON.stringify(meta)}`);
        }

        return includeRelatedResources(requestParams, { data: resources }, out).then(top => {
          if (top.included && top.included.length) {
            out.write(',"included":');
            out.write(JSON.stringify(top.included));
          }
          return bluebird.fromCallback(callback => out.write('}', callback));
        }).then(top => top as any as ISuccessResourceDocument | undefined);
      }));
}

function getResponseDocument(
  requestParams: IGetRequestParams, out?: Writable
): PromiseLike<void|ISuccessResourceDocument> {
  if (isRelatedRequest(requestParams)) {
    return requestParams.asLink
      ? getRelationshipDocument(requestParams, out)
      : getRelatedResourceDocument(requestParams, out);
  }
  return isGetOneRequest(requestParams)
    ? getResourceDocument(requestParams, out)
    : getResourcesDocument(requestParams, out);
}

export default function get(
  requestParams: IGetRequestParams, out?: Writable): PromiseLike<void|ISuccessResponseObject> {
  return getResponseDocument(requestParams, out).then(top => {
    if (top) {
      return { status: 200, body: top };
    }
    return;
  });
}
