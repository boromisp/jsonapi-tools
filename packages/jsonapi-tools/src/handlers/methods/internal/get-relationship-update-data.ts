'use strict';

import CustomError from '../../../utils/custom-error';

import { IRelationshipObject, IResourceIdentifierObject } from 'jsonapi-types';

export default function (type: string, body: IRelationshipObject, canBeEmpty?: boolean): IResourceIdentifierObject[] {
  if (
    Array.isArray(body.data)
    && (body.data.length || canBeEmpty)
    && body.data.every(identifier => identifier.type === type)
  ) {
    return body.data;
  }
  throw new CustomError('Malformed request body.', 400);
}
