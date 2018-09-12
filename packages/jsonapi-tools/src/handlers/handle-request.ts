'use strict';

import * as bluebird from 'bluebird';
import { file } from 'tmp-promise';
import { createWriteStream } from 'fs';

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

export default function handleRequest(
  requestObject: TypeRequestParams
): PromiseLike<ISuccessResponseObject> {
  return bluebird.try(() => {
    switch (requestObject.method) {
      case 'get': {
        return file({ discardDescriptor: true, postfix: '.json' }).then(tmpFile => {
          const writer = createWriteStream(tmpFile.path);
          return get(requestObject, writer).then(() => {
            writer.close();
            return { status: 200, file: tmpFile };
          }, err => {
            writer.close();
            tmpFile.cleanup();
            throw err;
          });
        });
      }
      case 'post': return post(requestObject);
      case 'patch': return patch(requestObject);
      case 'delete': return del(requestObject);
    }

    throw new CustomError(`Invalid method: ${(requestObject as any).method}.`, 400);
  });
}
