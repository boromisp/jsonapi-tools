'use strict';

import * as bluebird from 'bluebird';
import { Response } from 'express';

import parseRequest, { IJSONAPIRequest } from './parse-request';
import handleRequest, { TypeRequestParams } from '../../handlers/handle-request';
import handleErrors, { IErrorLogger } from '../../handlers/handle-errors';

import { ISuccessResponseObject, IErrorResponseObject } from '../../types/utils';

function mergeOptions(options: object, requestObject: TypeRequestParams) {
  requestObject.options = Object.assign({}, options, requestObject.options);
  requestObject.models = requestObject.options.models || {};
  return requestObject;
}

function sendResponse(
  res: Response,
  responseObject: ISuccessResponseObject | IErrorResponseObject
) {
  return () => {
    res.type('application/vnd.api+json').status(responseObject.status);
    if (responseObject.headers) {
      res.set(responseObject.headers);
    }
    if (responseObject.body) {
      res.send(responseObject.body);
    } else if ('file' in responseObject && responseObject.file) {
      res.sendFile(responseObject.file.path);
      res.once('end', responseObject.file.cleanup);
    } else {
      res.end();
    }
    res = undefined!;
  };
}

export interface IMiddlewareOptions {
  urlIsLink?: (url: string) => boolean;
  models?: any;
}

export default function createMiddleware({ urlIsLink, models }: IMiddlewareOptions) {
  const rest = { models };

  return (req: IJSONAPIRequest, res: Response) => {
    let errorLogger: IErrorLogger = console;

    return bluebird.try(() => parseRequest(req, urlIsLink)).then(request => {
      if (request.options.log && request.options.log.error) {
        errorLogger = request.options.log;
      }
      return handleRequest(mergeOptions(rest, request));
    }).then(response => sendResponse(res, response))
    .catch(error => handleErrors(error, errorLogger));
  };
}
