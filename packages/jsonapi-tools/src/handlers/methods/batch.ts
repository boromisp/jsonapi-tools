'use strict';

import * as bluebird from 'bluebird';
import modelForType from './internal/model-for-type';

import CustomError from '../../utils/custom-error';

import { IModel, IModels, IUpdateParams, IDeleteParams, ICreateParams } from '../../types/model';
import {
  IBatchOperation,
  IResourceObject,
  IResourceIdentifierObject,
  isBatchMeta,
  IJSONObject,
  IUpdateResourceDocument,
  IResourceObjectBase
} from 'jsonapi-types';

import { createResourceObject, ICreateRest } from './post';
import { IDeleteRest } from './delete';
import { updateResourceObject, IUpdateRest } from './patch';

function relationshipHasUnresolvedBatchID(data: IResourceIdentifierObject | IResourceIdentifierObject[] | null) {
  if (!data) {
    return false;
  }
  if (Array.isArray(data)) {
    for (const ident of data) {
      if (isBatchMeta(ident.meta) && ident.meta['batch-key'] && !ident.id) {
        return true;
      }
    }
    return false;
  } else {
    return isBatchMeta(data.meta) && data.meta['batch-key'] && !data.id;
  }
}

function resourceHasUnresolvedBatchID(resource: IBatchOperation) {
  if (isBatchMeta(resource.meta)
    && resource.meta['batch-key']
    && !resource.id
    && resource.meta.op
    && resource.meta.op !== 'create') {
    return true;
  }
  const relationships = resource.relationships;
  if (relationships) {
    for (const rel of Object.keys(relationships)) {
      if (relationshipHasUnresolvedBatchID(relationships[rel].data)) {
        return true;
      }
    }
  }
  return false;
}

const post: ICreateParams['method'] = 'post';
const patch: IUpdateParams['method'] = 'patch';
const del: IDeleteParams['method'] = 'delete';

function sidepostCreate(model: IModel, resource: IBatchOperation, rest: ICreateRest, models: IModels) {
  return createResourceObject(model, { data: resource } as IUpdateResourceDocument, rest, models);
}

function sidepostUpdate(model: IModel, resource: IBatchOperation, rest: IUpdateRest, models: IModels) {
  return updateResourceObject(model, resource.id!, { data: resource } as IUpdateResourceDocument, rest, models);
}

function sidepostDelete(model: IModel, resource: IBatchOperation, rest: IDeleteRest) {
  return model.delete(Object.assign({ id: resource.id! }, rest));
}

function cacheBatchKey(data: IResourceObjectBase, cache: Map<string, IResourceObjectBase[]>) {
  if (data && isBatchMeta(data.meta)) {
    const batchKey = data.meta['batch-key'];
    if (batchKey && data.meta.op !== 'create') {
      const keyArray = cache.get(batchKey);
      if (keyArray) {
        keyArray.push(data);
      } else {
        cache.set(batchKey, [data]);
      }
    }
  }
}

function resolveBatchKey(resource: IResourceObject | null, cache: Map<string, IResourceObjectBase[]>) {
  if (!resource) {
    return;
  }
  const batchKey = resource.meta && (resource.meta as IJSONObject)['batch-key'] as string;
  if (!batchKey) {
    return;
  }
  const keyArray = cache.get(batchKey);
  if (!keyArray) {
    return;
  }
  for (const op of keyArray) {
    if (op.type !== resource.type) {
      throw new CustomError(`Batch operation (${batchKey}) type mismatch: ${op.type} != ${resource.type}.`, 400);
    }
    op.id = resource.id;
  }
  cache.delete(batchKey);
}

function next(
  models: IModels,
  batchKeyReferences: Map<string, IResourceObjectBase[]>,
  remainingOperations: IBatchOperation[],
  createRest: ICreateRest,
  updateRest: IUpdateRest,
  deleteRest: IDeleteRest,
  results?: Array<IResourceObject | null>): PromiseLike<Array<IResourceObject | null>> {
  return bluebird.try(() => {
    if (remainingOperations.length === 0) {
      throw new CustomError('Empty batch array.', 400);
    }
    const nextOperationIndex = remainingOperations.findIndex(remOp => !resourceHasUnresolvedBatchID(remOp));
    if (nextOperationIndex === -1) {
      throw new CustomError('Could not resolve all the side posted operations', 400);
    }
    const nextOperation = remainingOperations.splice(nextOperationIndex, 1)[0];
    const op = (nextOperation.meta && nextOperation.meta.op) || 'create';
    const batchKey = (nextOperation.meta && nextOperation.meta['batch-key']);
    const model = modelForType(models, nextOperation.type);

    switch (op) {
    case 'create':
      return sidepostCreate(model, nextOperation, createRest, models).then(obj => {
        if (batchKey) {
          obj.meta = obj.meta || {};
          (obj.meta as IJSONObject)['batch-key'] = batchKey;
          resolveBatchKey(obj, batchKeyReferences);
        }
        return obj;
      });
    case 'update':
      return sidepostUpdate(model, nextOperation, updateRest, models).then(obj => {
        if (obj && batchKey) {
          obj.meta = obj.meta || {};
          (obj.meta as IJSONObject)['batch-key'] = batchKey;
        }
        return obj;
      });
    case 'delete':
      return sidepostDelete(model, nextOperation, deleteRest).then(data => {
        if (data === false) {
          throw new CustomError('Item not found.', 404);
        }
        return null;
      });
    default:
      throw new CustomError(`Invalid sideposting operation: ${op}.`, 400);
    }
  }).then((result: IResourceObject | null) => {
    if (!results) {
      results = [result];
    } else {
      results.push(result);
    }

    if (remainingOperations.length === 0) {
      return results;
    }

    return next(
      models,
      batchKeyReferences,
      remainingOperations,
      createRest,
      updateRest,
      deleteRest,
      results
    );
  });
}

export type ISidepostRest = Pick<ICreateRest, 'options'>;

export default function processBatch(
  models: IModels,
  batch: IBatchOperation[],
  rest: ISidepostRest
): PromiseLike<Array<IResourceObject|null>> {
  return bluebird.try(() => {
    const batchKeyReferences = new Map();
    for (const operation of batch) {
      cacheBatchKey(operation, batchKeyReferences);
      const relationships = operation.relationships;
      if (relationships) {
        for (const relname of Object.keys(relationships)) {
          const data = relationships[relname].data;
          if (Array.isArray(data)) {
            for (const relid of data) {
              cacheBatchKey(relid, batchKeyReferences);
            }
          } else if (data) {
            cacheBatchKey(data, batchKeyReferences);
          }
        }
      }
    }
    return next(
      models,
      batchKeyReferences,
      batch,
      Object.assign({ method: post }, rest),
      Object.assign({ method: patch }, rest),
      Object.assign({ method: del }, rest)
    );
  });
}
