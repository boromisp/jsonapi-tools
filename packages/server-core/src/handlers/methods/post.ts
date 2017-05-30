'use strict';

import * as bluebird from 'bluebird';
import invalidResourceObjectKey from './internal/invalid-resource-object-key';
import dataToResource from './internal/data-to-resource';
import dataToLinkage from './internal/data-to-linkage';
import getRelatedSchema from './internal/get-related-schema';
import getRelationshipUpdateData from './internal/get-relationship-update-data';
import modelForType from './internal/model-for-type';

import CustomError from '../../utils/custom-error';

import { IModel, IModels } from '../../types/model';
import { IRelationshipObject, IUpdateResourceDocument, IResourceObject } from 'jsonapi-types';
import { ISuccessResponseObject } from '../../types/utils';
import { IRequestParamsBase } from './types/request-params';

type ICreateRest = Pick<ICreateRequestParamsBase, 'method' | 'options'>;

function createResource(
  model: IModel,
  body: IUpdateResourceDocument,
  rest: ICreateRest
): PromiseLike<ISuccessResponseObject> {
  return bluebird.try(() => {
    const schema = model.schema;
    if (!body || !body.data) {
      throw new CustomError('The resource object of the item to be created must be provided in the request body.', 400);
    }
    if (body.data.type !== schema.type) {
      throw new CustomError('Type mismatch.', 409);
    }
    if (Object.keys(body.data).some(invalidResourceObjectKey)) {
      throw new CustomError('Malformed request body.', 400);
    }
    return model.create(Object.assign({
      data: Object.assign({}, body.data.attributes!, body.data.relationships!)
    }, rest));
  }).then(data => {
    const resource = dataToResource(model.schema, data) as IResourceObject;
    const response: ISuccessResponseObject = {
      status: 201,
      body: { data: resource }
    };
    const selfLink = resource.links && resource.links.self;
    if (selfLink) {
      response.headers = {
        location: typeof selfLink === 'string'
          ? selfLink
          : selfLink.href
      };
    }
    return response;
  });
}

function addToRelationship(
  model: IModel,
  id: string,
  relationship: string,
  body: IRelationshipObject,
  rest: ICreateRest
): PromiseLike<ISuccessResponseObject> {
  return bluebird.try(() => {
    const { type } = getRelatedSchema(model.schema, relationship);
    if (!model.addToRelationship) {
      // tslint:disable-next-line:max-line-length
      throw new CustomError(`Cannot add to ${model.schema.type}.${relationship} relationship. Try updating it to the new value instead.`, 403);
    }
    if (!body) {
      throw new CustomError('The IDs of related objects to be added must be provided in the request body.', 400);
    }
    return model.addToRelationship(Object.assign({
      id,
      relationship,
      data: getRelationshipUpdateData(type, body)
    }, rest));
  }).then(data => data ? {
    status: 200,
    body: dataToLinkage(model.schema, data, model.schema.type, id, relationship)
  } : { status: 204 });
}

export interface ICreateRequestParamsBase extends IRequestParamsBase {
  method: 'post';
  type: string;
  models: IModels;
}

export interface ICreateOneRequestParams extends ICreateRequestParamsBase {
  body: IUpdateResourceDocument;
}

export interface ICreateRelationshipRequestParams extends ICreateRequestParamsBase {
  id: string;
  relationship: string;
  body: IRelationshipObject;
}

export type ICreateRequestParams = ICreateOneRequestParams | ICreateRelationshipRequestParams;

function isRelatedRequest(request: ICreateRequestParams): request is ICreateRelationshipRequestParams {
  return (request as ICreateRelationshipRequestParams).relationship !== undefined;
}

export default function create(requestParams: ICreateRequestParams): PromiseLike<ISuccessResponseObject> {
  const { type, models, options, method } = requestParams;
  const rest = { options, method };

  return bluebird.try(() => modelForType(models, type))
    .then(model => isRelatedRequest(requestParams)
      ? addToRelationship(model, requestParams.id, requestParams.relationship, requestParams.body, rest)
      : createResource(model, requestParams.body, rest));
}
