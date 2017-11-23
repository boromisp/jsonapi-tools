'use strict';

import * as bluebird from 'bluebird';
import modelForType from './internal/model-for-type';

import CustomError from '../../utils/custom-error';

import { IModel, IModels, IUpdateParams, IDeleteParams, ICreateParams } from '../../types/model';
import { IUpdateResourceDocument, IResourceObject, IResourceIdentifierObject } from 'jsonapi-types';

import { createResourceObject, ICreateRest } from './post';
import { IDeleteRest } from './delete';
import { updateResourceObject, IUpdateRest } from './patch';

function relationshipHasUnresolvedBatchID(data: IResourceIdentifierObject | IResourceIdentifierObject[] | null) {
  if (!data) {
    return false;
  }
  if (Array.isArray(data)) {
    return data.some(ident => Boolean(ident.meta && ident.meta['batch-key'] && !ident.id));
  }
  return data.meta && data.meta['batch-key'] && !data.id;
}

function resourceHasUnresolvedBatchID(resource: IResourceObject) {
  if (resource.relationships) {  
    for (const rel of Object.keys(resource.relationships)) {
      if (relationshipHasUnresolvedBatchID(resource.relationships[rel].data)) {
        return true;
      }
    }
  }
  return Boolean(resource.meta && (resource.meta['batch-key'] && (resource.meta.op || 'create') !== 'create') && !resource.id);
}

function tryToResolveResourceRelationships(resource: IResourceObject, results: IResourceObject[]) {
  if (resource.relationships) {
    let stillHasUnresolved = false;
    for (const rel of Object.keys(resource.relationships)) {
      const data = resource.relationships[rel].data;
      if (Array.isArray(data)) {
        for (const ident of data) {
          if (!ident.id) {
            const batchKey = ident.meta && ident.meta['batch-key'];
            const relatedResource = results.find(res => (res.meta && res.meta['batch-key']) === batchKey);
            if (relatedResource) {
              ident.id = relatedResource.id;
            } else {
              stillHasUnresolved = true;
            }
          }
        }
      } else if (data && !data.id) {
        const batchKey = data.meta && data.meta['batch-key'];
        const relatedResource = results.find(res => (res.meta && res.meta['batch-key']) === batchKey);
        if (relatedResource) {
          data.id = relatedResource.id;
        } else {
          stillHasUnresolved = true;
        }
      }
    }
    if (resource.meta && (resource.meta['batch-key'] && (resource.meta.op || 'create') !== 'create') && !resource.id) {
      const batchKey = resource.meta && resource.meta['batch-key'];
      const relatedResource = results.find(res => (res.meta && res.meta['batch-key']) === batchKey);
      if (relatedResource) {
        resource.id = relatedResource.id;
      } else {
        stillHasUnresolved = true;
      }
    }
    return !stillHasUnresolved;
  }
  return true;
}

const post: ICreateParams['method'] = 'post';
const patch: IUpdateParams['method'] = 'patch';
const del: IDeleteParams['method'] = 'delete';

function sidepostCreate(model: IModel, resource: IResourceObject, rest: ICreateRest) {
  return createResourceObject(model, { data: resource }, rest);
}

function sidepostUpdate(model: IModel, resource: IResourceObject, rest: IUpdateRest) {
  return updateResourceObject(model, resource.id, { data: resource }, rest);
}

function sidepostDelete(model: IModel, resource: IResourceObject, rest: IDeleteRest) {
  return model.delete(Object.assign({ id: resource.id }, rest))
}

function batchStep(
  models: IModels,
  resolved: IResourceObject[],
  unresolved: IResourceObject[],
  // mainData: IResourceObject | null,
  createRest: ICreateRest,
  updateRest: IUpdateRest,
  deleteRest: IDeleteRest
): PromiseLike<Array<IResourceObject | null>> {
  return Promise.all(resolved.map(resource => {
    const op = (resource.meta && resource.meta.op) || 'create';
    const batchKey = (resource.meta && resource.meta['batch-key']);
    const model = modelForType(models, resource.type);

    switch (op) {
    case 'create':
      return sidepostCreate(model, resource, createRest).then(obj => {
        if (batchKey) {
          obj.meta = obj.meta || {};
          obj.meta['batch-key'] = batchKey;
        }
        return obj;
      });
    case 'update':
      return sidepostUpdate(model, resource, updateRest).then(obj => {
        if (obj && batchKey) {
          obj.meta = obj.meta || {};
          obj.meta['batch-key'] = batchKey;
        }
        return obj;
      });
    case 'delete':
      return sidepostDelete(model, resource, deleteRest).then(data => {
        if (data === false) {
          throw new CustomError('Item not found.', 404);
        }
        return null;
      });
    default:
      throw new CustomError(`Invalid sideposting operation: ${op}.`, 400);
    }
  })).then(results => {
    if (unresolved.length === 0) {
      return results;
    }

    const resultObjects: IResourceObject[] = [];
    for (const result of results) {
      if (result !== null) {
        resultObjects.push(result);
      }
    }
    
    let newUnresolved: IResourceObject[] = [];
    let newResolved: IResourceObject[] = [];

    const resolutions = unresolved.map(resource => tryToResolveResourceRelationships(resource, resultObjects));

    const i = resolutions.indexOf(false);

    if (i === 0) {
      newUnresolved = unresolved; 
    } else if (i === -1) {
      newResolved = unresolved;
    } else {
      newResolved = unresolved.slice(0, i);
      newUnresolved = unresolved.slice(i);
    }

    if (resolved.length === 0) {
      throw new CustomError('Could not resolve all the side posted operations', 400);
    }


    // const resolveMain = mainData && tryToResolveResourceRelationships(mainData, resultObjects);
    // if (resolveMain) {
    //   newResolved = [mainData!].concat(newResolved);
    // }

    return batchStep(
      models,
      newResolved,
      newUnresolved,
      createRest,
      updateRest,
      deleteRest).then(Array.prototype.concat.bind(results));
  });
}

export type ISidepostRest = Pick<ICreateRest, 'options'>;

export default function processIncluded(
  models: IModels,
  body: IUpdateResourceDocument,
  rest: ISidepostRest
): PromiseLike<(IResourceObject|null)[]> {
  return bluebird.try(() => {
    const included = body && body.included;
    if (!Array.isArray(included) || included.length === 0) {
      return [];
    }
    
    let unresolved: IResourceObject[] = [];
    let resolved: IResourceObject[] = [];

    const i = included.findIndex(resource => resourceHasUnresolvedBatchID(resource));

    if (i === 0) {
      unresolved = included; 
    } else if (i === -1) {
      resolved = included;
    } else {
      resolved = included.slice(0, i);
      unresolved = included.slice(i);
    }

    // const canResolveMain = !resourceHasUnresolvedBatchID(body.data);
    // if (canResolveMain) {
    //   resolved = [body.data].concat(resolved);
    // }

    if (resolved.length === 0) {
      throw new CustomError('Could not resolve all the side posted operations', 400);
    }

    return batchStep(
      models,
      resolved,
      unresolved,
      // canResolveMain ? null : body.data,
      Object.assign({ method: post }, rest),
      Object.assign({ method: patch }, rest),
      Object.assign({ method: del }, rest)
    ).then(processedIncluded => {
      const resultObjects: IResourceObject[] = [];
      for (const result of processedIncluded) {
        if (result !== null) {
          resultObjects.push(result);
        }
      }
      if (!tryToResolveResourceRelationships(body.data, resultObjects)) {
        throw new CustomError('Could not resolve all the side posted operations', 400);
      }
      return processedIncluded;
    });
  });
}
