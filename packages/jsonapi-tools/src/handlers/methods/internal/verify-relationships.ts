import * as bluebird from 'bluebird';
import { IUpdateResourceDocument, IResourceIdentifierObject } from 'jsonapi-types';

import { IModels, IResourceData } from '../../../types/model';

import modelForType from './model-for-type';

import CustomError from '../../../utils/custom-error';

function exists(data: IResourceIdentifierObject) {
  return (item: IResourceData | null) => {
    if (!item) {
      throw new CustomError('Related item not found (type: ' + data.type + ', id: ' + data.id + ')', 404);
    }
  };
}

export default function verifyRelationships(
  models: IModels,
  options: object,
  relationships?: IUpdateResourceDocument['data']['relationships']
) {
  return bluebird.try(() => {
    if (relationships) {
      return bluebird.all(Object.keys(relationships).reduce((promises, relname) => {
        const relationship = relationships[relname];

        if (Array.isArray(relationship.data)) {
          for (const data of relationship.data) {
            promises.push(modelForType(models, data.type).getOne({
              method: 'get',
              id: data.id,
              fields: { [data.type]: new Set(['id']) },
              options
            }).then(exists(data)));
          }
        } else if (relationship.data) {
          const data = relationship.data;
          promises.push(modelForType(models, data.type).getOne({
            method: 'get',
            id: data.id,
            fields: { [data.type]: new Set(['id']) },
            options
          }).then(exists(data)));
        }
        return promises;
      }, [] as Array<PromiseLike<void>>)).then(() => void 0);
    }
    return bluebird.resolve();
  });
}
