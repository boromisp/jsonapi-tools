'use strict';

import * as bluebird from 'bluebird';
import invalidResourceObjectKey from './internal/invalid-resource-object-key';
import dataToResource from './internal/data-to-resource';
import dataToLinkage from './internal/data-to-linkage';
import getRelatedSchema from './internal/get-related-schema';
import getRelationshipUpdateData from './internal/get-relationship-update-data';
import modelForType from './internal/model-for-type';
import verifyRelationships from './internal/verify-relationships';

import CustomError from '../../utils/custom-error';

import { IModel, IModels } from '../../types/model';
import { IResourceObject, IRelationshipObject, IUpdateResourceDocument } from 'jsonapi-types';
import { ISuccessResponseObject } from '../../types/utils';

import { IRequestParamsBase } from './types/request-params';

export type IUpdateRest = Pick<IUpdateRequestParamsBase, 'method' | 'options'>;

export function updateResourceObject(
  model: IModel,
  id: string,
  body: IUpdateResourceDocument,
  rest: IUpdateRest,
  models: IModels,
  baseUrl: string | undefined
) {
  return bluebird.try(() => {
    const schema = model.schema;
    if (!model.update) {
      throw new CustomError(`Cannot update objects with type ${schema.type}.`, 403);
    }
    if (!body || !body.data) {
      throw new CustomError('The updates for the resource object must be provided in the request body.', 400);
    }
    if (Array.isArray(body.data)) {
      throw new CustomError('Cannot update resource with array body.', 400);
    }
    if (body.data.type !== schema.type || body.data.id !== id) {
      throw new CustomError('Id or type mismatch.', 409);
    }
    if (Object.keys(body.data).some(invalidResourceObjectKey)) {
      throw new CustomError('Malformed request body.', 400);
    }

    return verifyRelationships(models, rest.options, body.data.relationships)
      .then(() => model.update(Object.assign({
        id,
        data: Object.assign({}, body.data.attributes!, body.data.relationships!)
      }, rest)));
  }).then(data => {
    if (data === false) {
      throw new CustomError('Item not found.', 404);
    } else if (data === true) {
      return null;
    }
    return data ? dataToResource(model.schema, data, baseUrl) : null;
  });
}

function updateRelationship(
  model: IModel,
  id: string,
  relationship: string,
  body: IRelationshipObject,
  rest: IUpdateRest
): PromiseLike<IRelationshipObject | null> {
  return bluebird.try(() => {
    const schema = getRelatedSchema(model.schema, relationship);
    if (!model.updateRelationship) {
      // tslint:disable-next-line:max-line-length
      throw new CustomError(`Cannot update the ${model.schema.type}.${relationship} relationship. Try updating the parent object instead.`, 403);
    }
    if (!body) {
      throw new CustomError('The IDs of related objects or an empty array must be provided in the request body.', 400);
    }
    return model.updateRelationship(Object.assign({
      id,
      relationship,
      data: getRelationshipUpdateData(schema.type, body, true)
    }, rest))
      .then(data => data ? dataToLinkage(schema, data, schema.type, id, relationship) : null);
  });
}

export interface IUpdateRequestParamsBase extends IRequestParamsBase {
  method: 'patch';
  type: string;
  id: string;
  models: IModels;
}

export interface IUpdateResourceRequestParams extends IUpdateRequestParamsBase {
  body: IUpdateResourceDocument;
}

export interface IUpdateRelationshipRequestParams extends IUpdateRequestParamsBase {
  relationship: string;
  body: IRelationshipObject;
}

export type IUpdateRequestParams = IUpdateResourceRequestParams | IUpdateRelationshipRequestParams;

function isRelatedRequest(request: IUpdateRequestParams): request is IUpdateRelationshipRequestParams {
  return (request as IUpdateRelationshipRequestParams).relationship !== undefined;
}

export default function update(requestParams: IUpdateRequestParams): PromiseLike<ISuccessResponseObject> {
  const { type, id, models, options, method, baseUrl } = requestParams;
  const rest = { options, method };

  return bluebird.try(() => modelForType(models, type))
    .then(model => (
        isRelatedRequest(requestParams)
        ? updateRelationship(model, id, requestParams.relationship, requestParams.body, rest)
        : updateResourceObject(model, id, requestParams.body, rest, models, baseUrl).then(data => ({ data }))
      ) as PromiseLike<IResourceObject | IRelationshipObject | null>
    ).then(top => top ? { status: 200, body: top } : { status: 204 }) as PromiseLike<ISuccessResponseObject>;
}
