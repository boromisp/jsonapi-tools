'use strict';

import * as bluebird from 'bluebird';

import get, { IGetRequestParams } from './methods/get';
import post, { ICreateRequestParams } from './methods/post';
import patch, { IUpdateRequestParams } from './methods/patch';
import del, { IDeleteRequestParams } from './methods/delete';

import { ISuccessResponseObject } from '../types/utils';
import CustomError from '../utils/custom-error';

export type TypeRequestParams =
  IGetRequestParams
  | ICreateRequestParams
  | IUpdateRequestParams
  | IDeleteRequestParams;

export default function handleRequest(requestObject: TypeRequestParams): PromiseLike<ISuccessResponseObject> {
  return bluebird.try(() => {
    switch (requestObject.method) {
      case 'get': return get(requestObject);
      case 'post': return post(requestObject);
      case 'patch': return patch(requestObject);
      case 'delete': return del(requestObject);
    }

    throw new CustomError(`Invalid method: ${(requestObject as any).method}.`, 400);
  });
}
