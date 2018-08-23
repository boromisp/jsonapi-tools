import { ISuccessDocument, IErrorDocument } from 'jsonapi-types';
import { FileResult } from 'tmp-promise';

export interface IExtendedError extends Error {
  status: number;
  source?: {
    pointer?: string;
    parameter?: string;
  };
  code?: number | string;
  title?: string;
}

export interface ISuccessResponseObject {
  body?: ISuccessDocument;
  file?: FileResult;
  status: number;
  headers?: { [key: string]: string };
}

export interface IErrorResponseObject {
  body?: IErrorDocument;
  status: number;
  headers?: { [key: string]: string };
}

export interface IParsedIncludes {
  [key: string]: IParsedIncludes;
}

export interface IParsedQueryFields {
  [key: string]: Set<string>;
}
