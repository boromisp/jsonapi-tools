'use strict';

import { Request } from 'express';
import { ParsedQs } from 'qs';

import { allowedMethods } from './cors-configs';
import { IParsedQueryFields, IParsedIncludes } from '../../types/utils';
import CustomError from '../../utils/custom-error';
import { TypeRequestParams } from '../../handlers/handle-request';
import { IRequestOptions } from '../../handlers/methods/types/request-params';

function getFields(field?: ParsedQs['key']): Set<string> {
  if (!field || typeof field !== 'string') {
    throw Object.assign(new Error('Malformed fields query parameter.'), { status: 400 });
  }
  return new Set(field.split(','));
}

function parseFieldsQuery(fieldsQuery?: ParsedQs['key']): IParsedQueryFields | null {
  if (!fieldsQuery || typeof fieldsQuery === 'string' || Array.isArray(fieldsQuery)) {
    return null;
  }

  const parsedFields: IParsedQueryFields = {};
  for (const type of Object.keys(fieldsQuery)) {
    parsedFields[type] = getFields(fieldsQuery[type]);
  }
  return parsedFields;
}

function parseIncludeQuery(includeQuery?: ParsedQs['key']): IParsedIncludes | null {
  if (!includeQuery || typeof includeQuery !== 'string') {
    return null;
  }

  const includes: IParsedIncludes = {};
  for (const path of includeQuery.split(',')) {
    let node = includes;
    for (const part of path.split('.')) {
      node = node[part] = node[part] || {};
    }
  }
  return includes;
}

function parseSortQuery(sortQuery?: ParsedQs['key']): string[] | null {
  return typeof sortQuery === 'string' ? sortQuery.split(',') : null;
}

function urlIsLink(url: string): boolean {
  return url.indexOf('/relationships/') !== -1;
}

export interface IJSONAPIRequest extends Request {
  jsonapi: IRequestOptions;
}

export default function (req: IJSONAPIRequest, customUrlIsLink?: (url: string) => boolean): TypeRequestParams {
  const {
    url, method, body,
    params: { type, id, relationship },
    query: { fields, filter, sort, include, page },
    jsonapi: options
  } = req;

  const asLink = customUrlIsLink ? customUrlIsLink(url) : urlIsLink(url);

  let currentAllowedMethods: string[];
  if (!id) {
    currentAllowedMethods = allowedMethods.items;
  } else if (!relationship) {
    currentAllowedMethods = allowedMethods.item;
  } else if (asLink) {
    currentAllowedMethods = allowedMethods.relationship;
  } else {
    currentAllowedMethods = allowedMethods.relatedItem;
  }

  if (currentAllowedMethods.indexOf(method.toUpperCase()) === -1) {
    throw new CustomError('Invalid method.', 400);
  }
  if (method.toUpperCase() === 'OPTIONS') {
    throw new CustomError('Invalid CORS configuration.', 500);
  }

  return {
    method: method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete',
    options,
    type,
    id,
    relationship,
    asLink,
    fields: parseFieldsQuery(fields),
    filters: filter || null,
    sorts: parseSortQuery(sort),
    page: page || null,
    includes: parseIncludeQuery(include),
    body,
    models: options.models,
    baseUrl: req.baseUrl,
  } as TypeRequestParams;
}
