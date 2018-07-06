'use strict';

import * as bluebird from 'bluebird';
import parseRequest, { IJSONAPIRequest, IRequestParams } from './parse-request';
import { Response } from 'express';
import handleRequest, { TypeRequestParams } from '../../handlers/handle-request';
import handleErrors, { IErrorLogger } from '../../handlers/handle-errors';

import {
  IResourceObject,
  IRelationshipObject,
  IResourceObjectBase,
  hasIncluded,
  ILinks,
  ILink,
  isSuccess,
  hasLinks,
  hasRelated,
  hasRelationships
} from 'jsonapi-types';
import { ISuccessResponseObject, IErrorResponseObject } from '../../types/utils';

function mergeOptions(options: object, requestObject: IRequestParams) {
  requestObject.options = Object.assign({}, options, requestObject.options);
  requestObject.models = requestObject.options.models || {};
  return requestObject;
}

function prefixLink(prefix: string, link: ILink): ILink {
  if (typeof link === 'string') {
    return prefix + link;
  }
  link.href = prefix + link.href;
  return link;
}

function prefixLinks(prefix: string, links?: ILinks) {
  if (links) {
    if (links.self) {
      links.self = prefixLink(prefix, links.self);
    }
    if (hasRelated(links) && links.related) {
      links.related = prefixLink(prefix, links.related);
    }
  }
}

/*
  IResourceObject | IResourceIdentifierObject | IResourceObjectBase | null
*/
function prefixDataLinks(prefix: string, data: IResourceObject | IRelationshipObject | IResourceObjectBase | null) {
  if (data) {
    prefixLinks(prefix, data.links);
    if (!hasRelationships(data) || !data.relationships) { return; }
    for (const relationship of Object.keys(data.relationships)) {
      prefixDataLinks(prefix, data.relationships[relationship]);
    }
  }
}

function sendResponse(
  baseUrl: string,
  res: Response,
  responseObject: ISuccessResponseObject | IErrorResponseObject,
  logger: IErrorLogger
) {
  try {
    if (responseObject.body) {
      if (hasLinks(responseObject.body)) {
        prefixLinks(baseUrl, responseObject.body.links);
      }
      if (isSuccess(responseObject.body) && responseObject.body.data) {
        if (Array.isArray(responseObject.body.data)) {
          for (const item of responseObject.body.data) {
            prefixDataLinks(baseUrl, item);
          }
        } else {
          const body = responseObject.body;
          const data = body.data;
          prefixDataLinks(baseUrl, data as (IResourceObject | IRelationshipObject | IResourceObjectBase | null));
        }
        if (hasIncluded(responseObject.body) && responseObject.body.included) {
          for (const item of responseObject.body.included) {
            prefixDataLinks(baseUrl, item);
          }
        }
      }
    }
  } catch (error) {
    logger.error(error.message, error.stack);
    responseObject = { status: 500 };
  }

  return () => {
    res.type('application/vnd.api+json').status(responseObject.status);
    if (responseObject.headers) {
      res.set(responseObject.headers);
    }
    if (responseObject.body) {
      res.send(responseObject.body);
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

  return (req: IJSONAPIRequest, res: Response, /*next: (e: Error) => void*/) => {
    let errorLogger: IErrorLogger = console;

    return bluebird.try(() => parseRequest(req, urlIsLink)).then(request => {
      if (request.options.log && request.options.log.error) {
        errorLogger = request.options.log;
      }
      return handleRequest(mergeOptions(rest, request) as TypeRequestParams);
    }).then(response => sendResponse(req.baseUrl, res, response, errorLogger))
    // .catch(error => sendResponse(req.baseUrl, res, handleErrors(error, errorLogger), errorLogger));
    .catch(error => handleErrors(error, errorLogger));
    // .catch(next);
  };
}
