'use strict';

import handleRequest, { TypeRequestParams } from '../../handlers/handle-request';
import denormalize, { IDenormalizedResource } from 'denormalize-jsonapi';

import { IModel } from '../../types/model';
import { IParsedQueryFields, IParsedIncludes } from '../../types/utils';

function buildIncludeMap(includes?: string[][]): IParsedIncludes | null {
  if (!includes || !includes.length) {
    return null;
  }
  return includes.reduce((rootNode: IParsedIncludes, path) => {
    let node = rootNode;
    for (const part of path) {
      node = node[part] = node[part] || {};
    }
    return rootNode;
  }, {});
}

function buildFieldsSets(fields?: { [key: string]: string[] }): IParsedQueryFields | null {
  if (fields) {
    const fieldSets: IParsedQueryFields = {};

    const types = Object.keys(fields);
    if (types.length) {
      let some = false;
      for (const type of types) {
        if (Array.isArray(fields[type]) && fields[type].length) {
          fieldSets[type] = new Set(fields[type]);
          some = true;
        }
      }
      if (some) {
        return fieldSets;
      }
    }
  }
  return null;
}

export interface ILocalRequestFields {
  [key: string]: string[];
}

export type ILocalRequestIncludes = string[][];

export interface ILocalRequestParams {
  relationship: string | null;
  includes?: ILocalRequestIncludes;
  filters: object | null;
  sorts: string[] | null;
  fields?: ILocalRequestFields;
  id?: string;
  asLink?: boolean;
  page: object | null;
  body: any;
}

export default function(
  models: { [key: string]: IModel },
  type: string,
  method: 'get' | 'patch' | 'post' | 'delete',
  options: any,
  requestParams: ILocalRequestParams): PromiseLike<IDenormalizedResource | IDenormalizedResource[] | null> {

  const { relationship, includes, filters, sorts, fields, id, asLink, page, body } = requestParams;

  return handleRequest({
    models,
    type,
    id,
    relationship,
    asLink: !!asLink,
    method,
    options: Object.assign({ models }, options),
    includes: buildIncludeMap(includes),
    filters,
    sorts,
    fields: buildFieldsSets(fields),
    page,
    body
  } as TypeRequestParams).then(response => {
    const document = denormalize(response.body || null, includes);
    return document && document.data;
   });
}
