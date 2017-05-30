'use strict';

import * as bluebird from 'bluebird';

import getRelatedSchema from './internal/get-related-schema';
import modelForType from './internal/model-for-type';
import dataToLinkage from './internal/data-to-linkage';
import dataToResource from './internal/data-to-resource';

import CustomError from '../../utils/custom-error';

import { IModel, IModels } from '../../types/model';

import { IRequestParamsBase } from './types/request-params';

import {
  IResourceObject,
  IRelationshipObject,
  ISuccessResourceDocument,
  ISuccessRelationshipDocument,
  IResourceIdentifierObject
} from 'jsonapi-types';
import { IParsedQueryFields, IParsedIncludes, ISuccessResponseObject } from '../../types/utils';

type IGetRest = Pick<IGetRequestParamsBase, 'method' | 'page' | 'options'>;

function getResource(
  model: IModel,
  id: string,
  fields: IParsedQueryFields | null,
  rest: IGetRest
): PromiseLike<IResourceObject | null> {
  return model.getOne(Object.assign({
    id,
    fields: fields && fields[model.schema.type]
  }, rest)).then(data => dataToResource(model.schema, data));
}

function getResources(
  model: IModel,
  ids: string[] | null,
  fields: IParsedQueryFields | null,
  filters: object | null,
  sorts: string[] | null,
  rest: IGetRest
): PromiseLike<IResourceObject[]> {
  if (ids === null) {
    return model.getAll(Object.assign({
      fields: fields && fields[model.schema.type],
      filters,
      sorts
    }, rest)).then(data => data ? data.map(item => dataToResource(model.schema, item)) : []);
  } else {
    return model.getSome(Object.assign({
      ids,
      fields: fields && fields[model.schema.type],
      filters,
      sorts
    }, rest)).then(data => data ? data.map(item => dataToResource(model.schema, item)) : []);
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
    if (!linkMap.has(link.type)) {
      linkMap.set(link.type, new Set());
    }
    linkMap.get(link.type)!.add(link.id);
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
  if (!itemCache.has(resource.type)) {
    itemCache.set(resource.type, new Map());
  }
  itemCache.get(resource.type)!.set(resource.id, resource);
}

function includeTier(
  models: IModels,
  fields: IParsedQueryFields | null,
  tierNodes: IParsedIncludes[],
  itemCache: TypeItemCache,
  includeNodeLinks: Map<IParsedIncludes, IResourceObject[]>,
  rest: IGetRest): PromiseLike<void> {
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
                return links.concat(relationshipData);
              }
              links.push(relationshipData);
            }
          }
          return links;
        }, []));
        includeNodeLinks.set(node[relationship], nodeLinks);
        buildLinkMap(nodeLinks, tierLinks);
      }
    }

    const newLinks = [...tierLinks].reduce((links: Array<[IModel, string[]]>, [type, ids]) => {
      const newIDs = [...ids].filter(id => !itemCache.has(type) || !itemCache.get(type)!.has(id));
      if (newIDs.length > 0) {
        links.push([modelForType(models, type), newIDs]);
      }
      return links;
    }, []);

    const promises = newLinks.map(([model, ids]) => getResources(model, ids, fields, null, null, rest));
    return bluebird.all(promises);
  }).then(resourceArrays => {
    for (const resources of resourceArrays) {
      for (const resource of resources) {
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
      return;
    }

    return includeTier(models, fields, nextTierNodes, itemCache, includeNodeLinks, rest);
  });
}

function getIncludedResources(
  models: IModels,
  primary: IResourceObject[],
  fields: IParsedQueryFields | null,
  includes: IParsedIncludes,
  rest: IGetRest
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

    return includeTier(models, fields, [includes], itemCache, includeNodeLinks, rest).then(() => {
      const included: IResourceObject[] = [];
      // TODO: what if includeNodeLinks doesn't contain includes?
      const primaryLinks = buildLinkMap(includeNodeLinks.get(includes)!);

      for (const [type, ids] of itemCache) {
        for (const [id, resource] of ids) {
          if (!primaryLinks.has(type) || !primaryLinks.get(type)!.has(id)) {
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
  page: object | null;
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
}

export interface IGetRelationshipRequestParams extends IGetRequestParamsBase {
  id: string;
  relationship: string;
  asLink: true;
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

function isRelatedRequest(
  request: IGetRequestParams
): request is IGetRelationshipRequestParams | IGetRelatedResourceRequestParams {
  return isGetOneRequest(request)
    && (request as IGetRelationshipRequestParams | IGetRelatedResourceRequestParams).relationship !== undefined;
}

function includeRelatedResources(
  requestParams: IGetOneRequestParams | IGetAllRequestParams | IGetRelatedResourceRequestParams,
  top: ISuccessResourceDocument
): PromiseLike<ISuccessResourceDocument> {
  const { models, fields, includes, options, page, method } = requestParams;
  const rest = { options, page, method};

  if (includes && top.data && (!Array.isArray(top.data) || top.data.length)) {
    const primary = Array.isArray(top.data) ? top.data : [top.data];
    return getIncludedResources(models, primary, fields, includes, rest).then(included => {
      if (included.length) {
        top.included = included;
      }
      return top;
    });
  }
  return bluebird.resolve(top);
}

function getRelatedResourceDocument(
  requestParams: IGetRelatedResourceRequestParams
): PromiseLike<ISuccessResourceDocument> {
  const { models, type, fields, options, page, method, filters, sorts, id, relationship } = requestParams;
  const rest = { options, page, method};

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
            fields, filters, sorts,
            rest
          ).then(data => { top.data = data; return top; });
        }
        top.data = [];
      } else if (relationshipObject.data) {
        return getResource(
          modelForType(models, relationshipObject.data.type),
          relationshipObject.data.id,
          fields,
          rest
        ).then(data => { top.data = data; return top; });
      }
      return top;
    }).then(top => includeRelatedResources(requestParams, top));
}

function getRelationshipDocument(
  requestParams: IGetRelationshipRequestParams
): PromiseLike<ISuccessRelationshipDocument> {
  const { models, type, options, page, method, id, relationship } = requestParams;
  const rest = { options, page, method};

  return bluebird.try(() => modelForType(models, type))
    .then(model => getRelationshipObject(model, id, relationship, null, rest));
}

function getResourceDocument(requestParams: IGetOneRequestParams): PromiseLike<ISuccessResourceDocument> {
  const { models, type, fields, options, page, method } = requestParams;
  const rest = { options, page, method};

  return bluebird.try(() => modelForType(models, type))
    .then(model => getResource(model, requestParams.id, fields, rest))
    .then(resource => {
      if (!resource) {
        throw new CustomError(`Item of type ${type} with id ${requestParams.id} not found.`, 404);
      }
      const top: ISuccessResourceDocument = { data: resource };
      if (resource.links) {
        top.links = { self: resource.links.self };
      }
      return top;
    });
}

function getResourcesDocument(requestParams: IGetAllRequestParams): PromiseLike<ISuccessResourceDocument> {
  const { models, type, fields, options, page, method } = requestParams;
  const rest = { options, page, method};

  return bluebird.try(() => modelForType(models, type))
    .then(model => getResources(model, null, fields, requestParams.filters, requestParams.sorts, rest)
      .then(resources => {
         return {
          links: model.schema.links ? model.schema.links({ id: false }) : {
            self: `/${type}`
          },
          data: resources
        } as ISuccessResourceDocument;
      }));
}

function getResponseDocument(
  requestParams: IGetRequestParams
): PromiseLike<ISuccessResourceDocument | ISuccessRelationshipDocument> {
  if (isRelatedRequest(requestParams)) {
    return requestParams.asLink
      ? getRelationshipDocument(requestParams)
      : getRelatedResourceDocument(requestParams);
  }
  return isGetOneRequest(requestParams)
    ? getResourceDocument(requestParams)
    : getResourcesDocument(requestParams);
}

export default function get(requestParams: IGetRequestParams): PromiseLike<ISuccessResponseObject> {
  return getResponseDocument(requestParams).then(top => ({ status: 200, body: top }));
}
