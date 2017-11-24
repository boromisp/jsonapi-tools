'use strict';

import * as bluebird from 'bluebird';
import modelForType from './internal/model-for-type';

import CustomError from '../../utils/custom-error';

import { IModel, IModels, IUpdateParams, IDeleteParams, ICreateParams } from '../../types/model';
import { IBatchOperation, IResourceObject, IResourceIdentifierObject, isBatchMeta, IJSONObject, IUpdateResourceDocument } from 'jsonapi-types';

import { createResourceObject, ICreateRest } from './post';
import { IDeleteRest } from './delete';
import { updateResourceObject, IUpdateRest } from './patch';

function relationshipHasUnresolvedBatchID(data: IResourceIdentifierObject | IResourceIdentifierObject[] | null) {
  if (!data) {
    return false;
  }
  if (Array.isArray(data)) {
    return data.some(ident => Boolean(isBatchMeta(ident.meta) && ident.meta['batch-key'] && !ident.id));
  }
  return Boolean(isBatchMeta(data.meta) && data.meta['batch-key'] && !data.id);
}

function resourceHasUnresolvedBatchID(resource: IBatchOperation) {
  if (resource.relationships) {  
    for (const rel of Object.keys(resource.relationships)) {
      if (relationshipHasUnresolvedBatchID(resource.relationships[rel].data)) {
        return true;
      }
    }
  }
  return Boolean(resource.meta && (resource.meta['batch-key'] && resource.meta.op && resource.meta.op !== 'create') && !resource.id);
}

const post: ICreateParams['method'] = 'post';
const patch: IUpdateParams['method'] = 'patch';
const del: IDeleteParams['method'] = 'delete';

function sidepostCreate(model: IModel, resource: IBatchOperation, rest: ICreateRest) {
  return createResourceObject(model, { data: resource } as IUpdateResourceDocument, rest);
}

function sidepostUpdate(model: IModel, resource: IBatchOperation, rest: IUpdateRest) {
  return updateResourceObject(model, resource.id!, { data: resource } as IUpdateResourceDocument, rest);
}

function sidepostDelete(model: IModel, resource: IBatchOperation, rest: IDeleteRest) {
  return model.delete(Object.assign({ id: resource.id! }, rest))
}

function next(
  models: IModels,
  batchKeyReferences: Map<string, Array<IBatchOperation | IResourceIdentifierObject>>,
  remainingOperations: IBatchOperation[],
  createRest: ICreateRest,
  updateRest: IUpdateRest,
  deleteRest: IDeleteRest): PromiseLike<Array<IResourceObject | null>> {
  return bluebird.try(() => {    
    const nextBatchStart = remainingOperations.findIndex(resourceHasUnresolvedBatchID);
    let currentBatch = [];
    
    if (nextBatchStart === -1) {
      currentBatch = remainingOperations;
      remainingOperations = [];
    } else if (nextBatchStart !== 0) {
      currentBatch = remainingOperations.slice(0, nextBatchStart);
      remainingOperations = remainingOperations.slice(nextBatchStart);
    } else {
      throw new CustomError('Could not resolve all the side posted operations', 400);
    }

    console.log({ currentBatch });

    return Promise.all(currentBatch.map(resource => {
      const op = (resource.meta && resource.meta.op) || 'create';
      const batchKey = (resource.meta && resource.meta['batch-key']);
      const model = modelForType(models, resource.type);
  
      switch (op) {
      case 'create':
        return sidepostCreate(model, resource, createRest).then(obj => {
          if (batchKey) {
            obj.meta = obj.meta || {};
            (obj.meta as IJSONObject)['batch-key'] = batchKey;
          }
          return obj;
        });
      case 'update':
        return sidepostUpdate(model, resource, updateRest).then(obj => {
          if (obj && batchKey) {
            obj.meta = obj.meta || {};
            (obj.meta as IJSONObject)['batch-key'] = batchKey;
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
      console.log({ results });
      if (remainingOperations.length === 0) {
        return results;
      }
      for (const result of results) {
        const batchKey = result && result.meta && (result.meta as IJSONObject)['batch-key'] as string;
        if (batchKey) {
          const references = batchKeyReferences.get(batchKey);
          console.log({ references });
          if (references) {
            for (const reference of references) {
              reference.id = result!.id;
              console.log({ reference });
            }
            batchKeyReferences.delete(batchKey);
          }
        }
      }
      return next(
        models,
        batchKeyReferences,
        remainingOperations,
        createRest,
        updateRest,
        deleteRest
      ).then(Array.prototype.concat.bind(results));
    });
  });
}

export type ISidepostRest = Pick<ICreateRest, 'options'>;

function addRefToBatchKey(
  batchKeyReferences: Map<string, Array<IBatchOperation | IResourceIdentifierObject>>,
  batchKey: string | undefined,
  ref: IBatchOperation | IResourceIdentifierObject
) {
  if (batchKey) {
    const refs = batchKeyReferences.get(batchKey);
    if (!refs) {
      batchKeyReferences.set(batchKey, [ref]);
    } else {
      refs.push(ref);
    }
  }
}

export default function processBatch(
  models: IModels,
  data: Array<IBatchOperation>,
  rest: ISidepostRest
): PromiseLike<(IResourceObject|null)[]> {
  return bluebird.try(() => {
    const batchKeyReferences = new Map();
    for (const operation of data) {
      let batchKey = operation.meta && operation.meta['batch-key'];
      if (batchKey && operation.meta.op && operation.meta.op !== 'create') {
        addRefToBatchKey(batchKeyReferences, batchKey, operation);
      }
      const relationships = operation.relationships;
      if (relationships) {
        for (const relname of Object.keys(relationships)) {
          const data = relationships[relname].data;
          if (Array.isArray(data)) {
            for (const relid of data) {
              if (isBatchMeta(relid.meta)) {
                addRefToBatchKey(batchKeyReferences, relid.meta['batch-key'], relid);
              }
            }
          } else if (data) {
            if (isBatchMeta(data.meta)) {
              addRefToBatchKey(batchKeyReferences, data.meta['batch-key'], data);
            }
          }
        }
      }
    }
    return next(
      models,
      batchKeyReferences,
      data,
      Object.assign({ method: post }, rest),
      Object.assign({ method: patch }, rest),
      Object.assign({ method: del }, rest)
    );
  });
}
