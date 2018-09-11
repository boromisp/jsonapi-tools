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
import {
  IRelationshipObject,
  IUpdateResourceDocument,
  ICreateResponseDocument,
  IResourceObject,
  IBatchResourceDocument
} from 'jsonapi-types';
import { ISuccessResponseObject } from '../../types/utils';
import { IRequestParamsBase } from './types/request-params';

import batch from './batch';

export type ICreateRest = Pick<ICreateRequestParamsBase, 'method' | 'options'>;

export function createResourceObject(
  model: IModel,
  body: IUpdateResourceDocument,
  rest: ICreateRest,
  models: IModels,
  baseUrl: string | undefined
): PromiseLike<IResourceObject> {
  return bluebird.try(() => {
    const schema = model.schema;
    if (!body || !body.data) {
      throw new CustomError('The resource object of the item to be created must be provided in the request body.', 400);
    }
    if (Array.isArray(body.data)) {
      throw new CustomError('Cannot create a single object with array body.', 400);
    }
    if (body.data.type !== schema.type) {
      throw new CustomError('Type mismatch.', 409);
    }
    if (Object.keys(body.data).some(invalidResourceObjectKey)) {
      throw new CustomError('Malformed request body.', 400);
    }

    return verifyRelationships(models, rest.options, body.data.relationships)
      .then(() => model.create(Object.assign({
        data: Object.assign({}, body.data.attributes!, body.data.relationships!)
      }, rest)))
      .then(data => dataToResource(model.schema, data, null, baseUrl));
  });
}

function createResource(
  model: IModel,
  docBody: IUpdateResourceDocument,
  rest: ICreateRest,
  models: IModels,
  baseUrl: string | undefined
): PromiseLike<ISuccessResponseObject> {
  return createResourceObject(model, docBody, rest, models, baseUrl).then(resource => {
    const body: ICreateResponseDocument = {
      data: resource
    };

    const response: ISuccessResponseObject = {
      status: 201,
      body
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
    const schema = getRelatedSchema(model.schema, relationship);
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
      data: getRelationshipUpdateData(schema.type, body)
    }, rest)).then(data => data ? {
      status: 200,
      body: dataToLinkage(schema, data, schema.type, id, relationship)
    } : { status: 204 });
  });
}

export interface ICreateRequestParamsBase extends IRequestParamsBase {
  method: 'post';
  type: string;
  models: IModels;
}

export interface ICreateOneRequestParams extends ICreateRequestParamsBase {
  body: IUpdateResourceDocument;
}

export interface IBatchRequestParams extends ICreateRequestParamsBase {
  body: IBatchResourceDocument;
}

export interface ICreateRelationshipRequestParams extends ICreateRequestParamsBase {
  id: string;
  relationship: string;
  body: IRelationshipObject;
}

export type ICreateRequestParams = ICreateOneRequestParams | ICreateRelationshipRequestParams | IBatchRequestParams;

function isRelatedRequest(request: ICreateRequestParams): request is ICreateRelationshipRequestParams {
  return (request as ICreateRelationshipRequestParams).relationship !== undefined;
}

function isBatchRequest(request: ICreateRequestParams): request is IBatchRequestParams {
  return (request as IBatchRequestParams).body.batch !== undefined;
}

export default function create(requestParams: ICreateRequestParams): PromiseLike<ISuccessResponseObject> {
  const { type, models, options, method, baseUrl } = requestParams;
  const rest = { options, method };

  if (isRelatedRequest(requestParams)) {
    return bluebird.try(() => modelForType(models, type))
      .then(model => addToRelationship(model, requestParams.id, requestParams.relationship, requestParams.body, rest));
  } else if (isBatchRequest(requestParams)) {
    return batch(models, requestParams.body.batch, rest, baseUrl).then(data => ({
      status: 200,
      body: { data }
    }));
  } else {
    return bluebird.try(() => modelForType(models, type))
      .then(model => createResource(model, requestParams.body, rest, models, baseUrl));
  }
}
