'use strict';

import * as JSONAPI from 'jsonapi-types';
import { IExtendedError, IErrorResponseObject } from '../types/utils';

export interface IErrorLogger {
  error: (message: any, ...optionalArgs: any[]) => void;
}

function transformError(error: IExtendedError): JSONAPI.IErrorObject {
  const val: JSONAPI.IErrorObject = {
    status: error.status,
    detail: error.message
  };
  if (error.source) {
    val.source = error.source;
  }
  if (error.code) {
    val.code = error.code;
  }
  if (error.title) {
    val.title = error.title;
  }
  return val;
}

export default function handleErrors(
  errorOrErrors: IExtendedError | IExtendedError[] | undefined,
  errorLogger: IErrorLogger
): IErrorResponseObject {
  let errors: JSONAPI.IErrorObject[];

  if (Array.isArray(errorOrErrors)) {
    if (errorOrErrors.length && errorOrErrors[0].status) {
      errors = errorOrErrors.map(transformError);
    } else if (!errorOrErrors.length) {
      errors = [{ detail: 'Unknown internal error: []' }];
    } else {
      errorLogger.error(errorOrErrors[0].message, errorOrErrors[0].stack);
      errors = [{ detail: `Unknown internal error: ${errorOrErrors[0].message}` }];
    }
  } else if (errorOrErrors && errorOrErrors.status) {
    errors = [transformError(errorOrErrors)];
  } else {
    if (errorOrErrors && errorOrErrors.message && errorOrErrors.stack) {
      errorLogger.error(errorOrErrors.message, errorOrErrors.stack);
    }
    errors = [{ detail: `Unknown internal error: ${errorOrErrors ? errorOrErrors.message : '<unknown>'}` }];
  }
  throw errors;
  // return { status: errors[0].status || 500, body: { errors } };
}
