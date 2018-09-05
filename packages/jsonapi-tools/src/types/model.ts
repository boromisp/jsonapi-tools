import {
  IResourceLinks,
  IRelationshipLinks,
  IResourceIdentifierObject,
  IJSONObject,
} from 'jsonapi-types';

export interface ISchemaBase {
  type: string;
}

export interface IRelationshipSchema extends ISchemaBase {
  links?: (parentType: string, parentId: string, relationship: string) => IRelationshipLinks;
  readonly?: boolean;
}

export interface ISchema extends ISchemaBase {
  type: string;
  attributes?: string[];
  relationships?: { [key: string]: IRelationshipSchema };
  links?: (id?: string) => IResourceLinks;
}

export interface IDataLinkage {
  id: string | number;
  meta?: IJSONObject;
}

export type ILinkage = IDataLinkage | string | number;

export function isDataLinkage(linkage: ILinkage): linkage is IDataLinkage {
  return !!linkage && typeof linkage === 'object' && linkage.id !== undefined;
}

export interface ILinkageData {
  type: string;
  id: string;
  meta?: IJSONObject;
}

export interface IResourceData {
  id: string;
  meta?: IJSONObject;
  [key: string]: any;
}

export type IModelContext = any;

export interface IGetOneParams {
  method: 'get';
  id: string;
  fields: Set<string> | null;
  options: IModelContext;
}

export interface IGetSomeParams {
  method: 'get';
  ids: string[];
  fields: Set<string> | null;
  filters: IFilters | null;
  sorts: string[] | null;
  page: IPage | null;
  options: IModelContext;
}

export interface IGetAllParams {
  method: 'get';
  ids?: null;
  fields: Set<string> | null;
  filters: IFilters | null;
  sorts: string[] | null;
  page: IPage | null;
  options: IModelContext;
}

export interface IUpdateParams {
  method: 'patch';
  id: string;
  data: IJSONObject;
  options: IModelContext;
}

export interface ICreateParams {
  method: 'post';
  data: IJSONObject;
  options: IModelContext;
}

export interface IDeleteParams {
  method: 'delete';
  id: string;
  options: IModelContext;
}

export interface IChangeRelationshipParamsBase {
  method: string;
  id: string;
  relationship: string;
  data: IResourceIdentifierObject[];
  options: IModelContext;
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
  readonly schema: ISchema;
  readonly defaultFields?: Set<string>;
  readonly defaultSorts?: string[];
  readonly defaultPage?: IPage;
  readonly hasPublicField: boolean;
  mapResult: null | ((data: IResourceData) => IResourceData);

  getOne(obj: IGetOneParams): PromiseLike<IResourceData | null>;
  getSome(obj: IGetSomeParams): PromiseLike<IResourceData[]>;
  getAll(obj: IGetAllParams): PromiseLike<IResourceData[]>;

  update(obj: IUpdateParams): PromiseLike<IResourceData | boolean | null>;
  create(obj: ICreateParams): PromiseLike<IResourceData>;
  delete(obj: IDeleteParams): PromiseLike<boolean>;
  deleteFromRelationship?(obj: IDeleteFromRelationshipParams): PromiseLike<ILinkage[] | null>;
  addToRelationship?(obj: IAddToRelationshipParams): PromiseLike<ILinkage[] | null>;
  updateRelationship?(obj: IUpdateRelationshipParams): PromiseLike<ILinkage[] | null>;

  mapInput(data: IResourceData): IResourceData;
}

export interface IModels { [key: string]: IModel; }

export type IFilter = {
  gt?: string;
  lt?: string;
  gte?: string;
  lte?: string;
  eq?: string;
  ne?: string;
  in?: string;
  nin?: string;
  m2m?: string;
  pattern?: string;
  contains?: string;
  'contains-ts'?: string;
  is?: 'true' | 'false' | 'not_true' | 'not_false' | 'null';
  null?: 'true' | 'false';
  having?: TFilter;
} & { [filter: string]: string };

export type TFilter = IFilter | string;

export type IFilters =  {
  or?: IFilter;
  'grouped-by'?: string;
} & { [field: string]: TFilter; };

export interface IPage {
  before?: string;
  after?: string;
  offset?: string;
  limit?: string;
  count?: 'on' | 'yes';
}
