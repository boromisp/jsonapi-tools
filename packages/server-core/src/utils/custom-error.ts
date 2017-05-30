import { IExtendedError } from '../types/utils';

export default class CustomError extends Error implements IExtendedError {
  public readonly status: number;

  constructor(message: string = '', status: number = 500) {
    super(message);

    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;

    if (status) {
      this.status = status;
    }
  }
}
