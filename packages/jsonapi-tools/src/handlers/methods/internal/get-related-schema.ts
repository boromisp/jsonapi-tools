'use strict';

import CustomError from '../../../utils/custom-error';
import { ISchema } from '../../../types/model';

export default function getRelatedSchema(schema: ISchema, relationship: string) {
  const relatedSchema = schema.relationships && schema.relationships[relationship];
  if (relatedSchema) {
    return relatedSchema;
  }
  throw new CustomError(`Type ${schema.type} has no relationship named ${relationship}.`, 404);
}
