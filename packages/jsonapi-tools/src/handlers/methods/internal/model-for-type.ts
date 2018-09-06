'use strict';

import CustomError from '../../../utils/custom-error';

import { IModel, IModels } from '../../../types/model';

export default function modelForType(models: IModels, type: string): IModel {
  if (models[type] !== undefined) {
    return models[type];
  }
  throw new CustomError(`Model for type ${type} could not be found.`, 404);
}
