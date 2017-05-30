import { ISuccessDocument, IErrorDocument } from 'jsonapi-types';

export interface IExtendedError extends Error {
  status: number;
  source?: string;
  code?: number | string;
  title?: string;
}

export interface ISuccessResponseObject {
  body?: ISuccessDocument;
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
