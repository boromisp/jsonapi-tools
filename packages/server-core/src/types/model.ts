import {
  IResourceLinks,
  IRelationshipLinks,
  IResourceIdentifierObject,
  IJSONObject
} from 'jsonapi-types';

export interface ISchemaBase {
  type: string;
}

export interface IRelationshipSchema extends ISchemaBase {
  links?: (parentType: string, parentId: string, relationship: string) => IRelationshipLinks;
}

export interface ISchema extends ISchemaBase {
  type: string;
  attributes?: string[];
  relationships?: { [key: string]: IRelationshipSchema };
  links?: (id?: string) => IResourceLinks;
}

export interface IDataLinkage {
  id: string | number;
  meta?: any;
}

export type ILinkage = IDataLinkage | string | number;

export function isDataLinkage(linkage: ILinkage): linkage is IDataLinkage {
  return !!linkage && typeof linkage === 'object' && linkage.id !== undefined;
}

export interface ILinkageData {
  type: string;
  id: string;
  meta?: any;
}

export interface IResourceData {
  id: string;
  meta?: any;
  [key: string]: any;
}

export interface IGetOneParams {
  method: 'get';
  id: string;
  fields: Set<string> | null;
  options: object;
}

export interface IGetSomeParams {
  method: 'get';
  ids: string[];
  fields: Set<string> | null;
  filters: object | null;
  sorts: string[] | null;
  page: object | null;
  options: object;
}

export interface IGetAllParams {
  method: 'get';
  ids?: null;
  fields: Set<string> | null;
  filters: object | null;
  sorts: string[] | null;
  page: object | null;
  options: object;
}

export interface IUpdateParams {
  method: 'patch';
  id: string;
  data: IJSONObject;
  options: object;
}

export interface ICreateParams {
  method: 'post';
  data: IJSONObject;
  options: object;
}

export interface IDeleteParams {
  method: 'delete';
  id: string;
  options: object;
}

export interface IChangeRelationshipParamsBase {
  method: string;
  id: string;
  relationship: string;
  data: IResourceIdentifierObject[];
  options: object;
}

export interface IDeleteFromRelationshipParams extends IChangeRelationshipParamsBase {
  method: 'delete';
}

export interface IUpdateRelationshipParams extends IChangeRelationshipParamsBase {
  method: 'patch';
}

export interface IAddToRelationshipParams extends IChangeRelationshipParamsBase {
  method: 'post';
}

export interface IModel {
  schema: ISchema;
  getOne: (obj: IGetOneParams) => PromiseLike<IResourceData | null>;
  getSome: (obj: IGetSomeParams) => PromiseLike<IResourceData[]>;
  getAll: (obj: IGetAllParams) => PromiseLike<IResourceData[]>;
  update: (obj: IUpdateParams) => PromiseLike<IResourceData | boolean | null>;
  create: (obj: ICreateParams) => PromiseLike<IResourceData>;
  delete: (obj: IDeleteParams) => PromiseLike<boolean>;
  deleteFromRelationship?: (obj: IDeleteFromRelationshipParams) => PromiseLike<ILinkage[] | null>;
  addToRelationship?: (obj: IAddToRelationshipParams) => PromiseLike<ILinkage[] | null>;
  updateRelationship?: (obj: IUpdateRelationshipParams) => PromiseLike<ILinkage[] | null>;
}

export interface IModels { [key: string]: IModel; }
