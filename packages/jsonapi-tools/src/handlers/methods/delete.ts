'use strict';

import * as bluebird from 'bluebird';

import modelForType from './internal/model-for-type';
import getRelatedSchema from './internal/get-related-schema';
import getRelationshipUpdateData from './internal/get-relationship-update-data';

import CustomError from '../../utils/custom-error';

import { IRelationshipObject } from 'jsonapi-types';
import { IModel, IModels } from '../../types/model';
import { ISuccessResponseObject } from '../../types/utils';

import { IRequestParamsBase } from './types/request-params';

export type IDeleteRest = Pick<IDeleteResourceRequestParams, 'method' | 'options'>;

function deleteFromRelationship(
  model: IModel,
  id: string,
  relationship: string,
  body: IRelationshipObject | null,
  rest: IDeleteRest
): PromiseLike<any> {
  return bluebird.try(() => {
    const { type } = getRelatedSchema(model.schema, relationship);
    if (!model.deleteFromRelationship) {
      // tslint:disable-next-line:max-line-length
      throw new CustomError(`Cannot delete from ${model.schema.type}.${relationship} relationship. Try updating it to the new value instead.`, 403);
    }
    if (!body) {
      throw new CustomError('The IDs of related objects to be deleted must be provided in the request body.', 400);
    }
    return model.deleteFromRelationship(Object.assign({
      id,
      relationship,
      data: getRelationshipUpdateData(type, body)
    }, rest));
  });
}

function deleteResource(model: IModel, id: string, rest: IDeleteRest): PromiseLike<void> {
  return model.delete(Object.assign({ id }, rest)).then(success => {
    if (!success) {
      throw new CustomError('Item not found.', 404);
    }
  });
}

export interface IDeleteResourceRequestParams extends IRequestParamsBase {
  method: 'delete';
  type: string;
  id: string;
  models: IModels;
}

export interface IDeleteRelatedRequestParams extends IDeleteResourceRequestParams {
  relationship: string;
  body: IRelationshipObject;
}

export type IDeleteRequestParams = IDeleteResourceRequestParams | IDeleteRelatedRequestParams;

function isRelatedRequest(request: IDeleteRequestParams): request is IDeleteRelatedRequestParams {
  return (request as IDeleteRelatedRequestParams).relationship !== undefined;
}

export default function deleteHandler(requestParams: IDeleteRequestParams): PromiseLike<ISuccessResponseObject> {
  const { type, id, models, options, method } = requestParams;
  const rest = { options, method };

  return bluebird.try(() => modelForType(models, type))
    .then(model => isRelatedRequest(requestParams)
      ? deleteFromRelationship(model, id, requestParams.relationship, requestParams.body, rest)
      : deleteResource(model, id, rest))
    .then(() => ({ status: 204 }));
}
