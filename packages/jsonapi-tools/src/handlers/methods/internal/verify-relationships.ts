import * as bluebird from 'bluebird';
import {
  IUpdateResourceDocument,
  IResourceIdentifierObject,
} from 'jsonapi-types';

import { IModels, IResourceData, ISchema } from '../../../types/model';

import modelForType from './model-for-type';

import CustomError from '../../../utils/custom-error';

function exists(data: IResourceIdentifierObject) {
  return (item: IResourceData | null) => {
    if (!item) {
      throw new CustomError(
        'Related item not found (type: ' + data.type + ', id: ' + data.id + ')',
        404
      );
    }
  };
}

const fields = new Set(['id']);
const method = 'get';

export default function verifyRelationships(
  models: IModels,
  origOptions: object,
  schema: ISchema,
  relationships: IUpdateResourceDocument['data']['relationships'] | undefined
) {
  const rels = schema.relationships;
  if (!relationships) {
    return bluebird.resolve();
  }

  return bluebird.try(() => {
    return bluebird
      .all(
        Object.keys(relationships).reduce((promises, relname) => {
          if (!rels || !rels[relname]) {
            throw new CustomError(
              'Relationship not exists: ' + schema.type + '.' + relname
            );
          }

          const relationship = relationships[relname];
          const options = Object.assign(
            { forRelationship: { type: schema.type, field: relname } },
            origOptions
          );

          if (Array.isArray(relationship.data)) {
            for (const data of relationship.data) {
              promises.push(
                modelForType(models, data.type)
                  .getOne({
                    method,
                    fields,
                    options,
                    id: data.id,
                  })
                  .then(exists(data))
              );
            }
          } else if (relationship.data) {
            const data = relationship.data;
            promises.push(
              modelForType(models, data.type)
                .getOne({
                  method,
                  fields,
                  options,
                  id: data.id,
                })
                .then(exists(data))
            );
          }
          return promises;
        }, [] as PromiseLike<void>[])
      )
      .then(() => void 0);
  });
}
