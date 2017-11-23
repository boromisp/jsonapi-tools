import { IJSONObject, IJSONArray, IJSONValue } from './json';
export { IJSONObject, IJSONArray, IJSONValue };



/**
 * http://jsonapi.org/format/1.0/#document-links
 */
export type ILink = string | {
  href: string;
  meta?: IJSONObject;
};

/**
 * http://jsonapi.org/format/1.0/#fetching-pagination
 */
export interface IPaginationLinks {
  first?: ILink | null;
  last?: ILink | null;
  prev?: ILink | null;
  next?: ILink | null;
}

/**
 * http://jsonapi.org/format/1.0/#document-links
 * http://jsonapi.org/format/1.0/#document-top-level
 * http://jsonapi.org/format/1.0/#document-resource-object-relationships
 */
export interface IResourceLinks extends IPaginationLinks {
  self?: ILink | null;
}

export interface IRelationshipLinks extends IResourceLinks {
  related?: ILink | null;
}

export type ILinks = IResourceLinks | IRelationshipLinks;

/**
 * http://jsonapi.org/format/1.0/#document-jsonapi-object
 */
export interface IJSONAPIObject {
  version?: string;
  meta?: IJSONObject;
}

/**
 * http://jsonapi.org/format/1.0/#document-resource-identifier-objects
 */
export interface IResourceIdentifierObject {
  type: string;
  id: string;
  meta?: IJSONObject;
}

/**
 * http://jsonapi.org/format/1.0/#document-resource-object-linkage
 */
export type IResourceLinkage = IResourceIdentifierObject | IResourceIdentifierObject[] | null;

/**
 * http://jsonapi.org/format/1.0/#document-resource-object-relationships
 */
export interface IRelationshipObject {
  data: IResourceLinkage;
  links?: IRelationshipLinks;
  meta?: IJSONObject;
}

/**
 * http://jsonapi.org/format/1.0/#document-resource-objects
 */
export interface IResourceObject {
  id: string;
  type: string;
  attributes?: IJSONObject;
  relationships?: {
    [field: string]: {
      data: IResourceLinkage;
      links?: IRelationshipLinks;
      meta?: IJSONObject;
    }
  };
  links?: IResourceLinks;
  meta?: IJSONObject;
}

/**
 * http://jsonapi.org/format/1.0/#error-objects
 */
export interface IErrorObject {
  id?: string;
  links?: { about: string };
  status?: number;
  code?: string | number;
  title?: string;
  detail?: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
  meta?: IJSONObject;
}

export interface IDocumentBase {
  jsonapi?: IJSONAPIObject;
  meta?: IJSONObject;
}

/**
 * http://jsonapi.org/format/1.0/#fetching-resources-responses
 * http://jsonapi.org/format/1.0/#fetching-includes
 * http://jsonapi.org/format/1.0/#document-top-level
 */
export interface ISuccessResourceDocument extends IDocumentBase {
  data: IResourceObject | IResourceObject[] | null;
  included?: IResourceObject[];
  links?: IResourceLinks;
}

/**
 * http://jsonapi.org/format/1.0/#fetching-resources-responses-404
 */
export interface IErrorResourceDocument extends IDocumentBase {
  errors: IErrorObject[];
  links?: IResourceLinks;
}

/**
 * http://jsonapi.org/format/1.0/#fetching-relationships-responses
 * http://jsonapi.org/format/1.0/#document-top-level
 */
export interface ISuccessRelationshipDocument extends IDocumentBase {
  data: IResourceLinkage;
  links?: IRelationshipLinks;
}

/**
 * http://jsonapi.org/format/1.0/#fetching-relationships-responses-404
 */
export interface IErrorRelationshipDocument extends IDocumentBase {
  errors: IErrorObject[];
  links?: IRelationshipLinks;
}

/**
 * http://jsonapi.org/format/1.0/#crud-updating
 */
export interface IUpdateResourceDocument extends IDocumentBase {
  data: IResourceObject;
  included?: IResourceObject[]
}

/**
 * http://jsonapi.org/format/1.0/#crud-creating-responses
 */
export interface ICreateResponseDocument extends IDocumentBase {
  data: IResourceObject;
  included?: Array<IResourceObject | null>
}

export type ISuccessDocument =
  ISuccessResourceDocument
  | ISuccessRelationshipDocument
  | ICreateResponseDocument;

export type IErrorDocument =
  IErrorResourceDocument
  | IErrorRelationshipDocument;

export type IResponseDocument =
  ISuccessResourceDocument
  | IErrorResourceDocument
  | ISuccessRelationshipDocument
  | IErrorRelationshipDocument
  | ICreateResponseDocument;

export type IGetResponseDocument =
  ISuccessResourceDocument
  | IErrorResourceDocument
  | ISuccessRelationshipDocument
  | IErrorRelationshipDocument;

export function isSuccess(document: IResponseDocument): document is ISuccessDocument {
  return (document as ISuccessDocument).data !== undefined;
}

export function hasLinks(document: IResponseDocument): document is IGetResponseDocument {
  return (document as IGetResponseDocument).links !== undefined;
}

export function hasIncluded(document: IResponseDocument): document is ISuccessResourceDocument {
  return (document as ISuccessResourceDocument).included !== undefined;
}

export function hasRelated(links: ILinks): links is IRelationshipLinks {
  return (links as IRelationshipLinks).related !== undefined;
}

export function hasRelationships(data: IResourceObject | IRelationshipObject): data is IResourceObject {
  return (data as IResourceObject).relationships !== undefined;
}
