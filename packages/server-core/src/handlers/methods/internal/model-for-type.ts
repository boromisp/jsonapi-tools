'use strict';

import CustomError from '../../../utils/custom-error';

import { IModel } from '../../../types/model';

export default function modelForType(models: { [key: string]: IModel }, type: string): IModel {
  if (type in models) {
    return models[type];
  }
  throw new CustomError(`Model for type ${type} could not be found.`, 404);
}
