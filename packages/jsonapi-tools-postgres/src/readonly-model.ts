import * as bluebird from 'bluebird';

import PostgresModel from './postgres-model';
import { CustomError } from 'jsonapi-tools';

export default class ReadonlyModel extends PostgresModel {
  public create(_?: any): PromiseLike<any> {
    return bluebird.reject(new CustomError('Not implemented', 403));
  }

  public update(_?: any): PromiseLike<any> {
    return bluebird.reject(new CustomError('Not implemented', 403));
  }

  public delete(_?: any): PromiseLike<any> {
    return bluebird.reject(new CustomError('Not implemented', 403));
  }
}
