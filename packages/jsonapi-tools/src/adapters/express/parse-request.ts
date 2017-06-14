'use strict';

import { allowedMethods } from './cors-configs';
import { Request } from 'express';

import { IParsedQueryFields, IParsedIncludes } from '../../types/utils';
import { IModel } from '../../types/model';
import CustomError from '../../utils/custom-error';

function getFields(field?: string): Set<string> {
  if (!field || !field.split) {
    throw Object.assign(new Error('Malformed fields query parameter.'), { status: 400 });
  }
  return new Set(field.split(','));
}

interface IQueryFields {
  [key: string]: string;
}

function parseFieldsQuery(fieldsQuery?: IQueryFields): IParsedQueryFields | null {
  if (!fieldsQuery) {
    return null;
   }
  const parsedFields: IParsedQueryFields = {};
  for (const type of Object.keys(fieldsQuery)) {
    parsedFields[type] = getFields(fieldsQuery[type]);
  }
  return parsedFields;
}

function parseIncludeQuery(includeQuery?: string): IParsedIncludes | null {
  if (!includeQuery || !includeQuery.split) {
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

function parseSortQuery(sortQuery?: string): string[] | null {
  return sortQuery && sortQuery.split ? sortQuery.split(',') : null;
}

function urlIsLink(url: string): boolean {
  return url.indexOf('/relationships/') !== -1;
}

export interface IRequestParams {
  method: 'get' | 'patch' | 'post' | 'delete';
  options: any;
  type: string;
  id?: string;
  relationship?: string;
  asLink: boolean;
  fields: IParsedQueryFields | null;
  filters: object | null;
  sorts: string[] | null;
  page: object | null;
  includes: IParsedIncludes | null;
  body: any;
  models?: { [key: string]: IModel };
}

export interface IJSONAPIRequest extends Request {
  jsonapi: any;
}

export default function(req: IJSONAPIRequest, customUrlIsLink?: (url: string) => boolean): IRequestParams {
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
    models: options.models
  };
}
