import * as bluebird from 'bluebird';
import {
  CustomError,
  IModel,
  IModelContext,
  IPage,
  IResourceData,
  IUpdateParams,
  ICreateParams,
  IDeleteParams,
  IFilters,
  ISchema,
  IRelationshipSchema
} from 'jsonapi-tools';
import { IJSONValue, IJSONObject } from 'jsonapi-types';

import { IBaseProtocol } from 'pg-promise';

import baseMapInput from '../utils/base-map-input';
import baseMapResult from '../utils/base-map-result';
import { generateSelect } from '../utils/postgres-utils';

export type FJoinGenerator = (parentTableAlias: string, childTableAlias: string) => string;

export interface IImmediateJoinRelationship extends IRelationshipSchema {
  sqlJoin: FJoinGenerator;
}

export interface IIndirectJoinRelationship extends IRelationshipSchema {
  junctionTable: string;
  sqlJoins: [FJoinGenerator, FJoinGenerator];
}

export type TPostgresRelationshipSchmea = (
  IRelationshipSchema | IImmediateJoinRelationship | IIndirectJoinRelationship
);

export function isImmediateJoin(rel: TPostgresRelationshipSchmea): rel is IImmediateJoinRelationship {
  return 'sqlJoin' in rel;
}

export function isIndirectJoin(rel: TPostgresRelationshipSchmea): rel is IIndirectJoinRelationship {
  return 'sqlJoins' in rel && 'junctionTable' in rel;
}

function setFunction(obj: object, name: string | number | symbol, fn: any) {
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: fn
  });
  return fn;
}

function identity(x: any) { return x; }

function notImplemented() { return bluebird.reject(new CustomError('Not implemented', 403)); }

function expectSingleRow(rows: IResourceData[]): IResourceData | null {
  if (rows.length > 1) {
    throw new CustomError('Multiple rows were not expected', 409);
  } else if (rows.length === 1) {
    return rows[0];
  } else {
    return null;
  }
}

export type TModelAction = 'getOne' | 'getSome' | 'getAll' | 'create' | 'update' | 'delete';

export interface IJoinDef {
  table: string;
  condition: string;
}

export interface IColumnDef {
  get?: string | false;
  set?: string;
  column?: string;
  hidden?: true;
  default?: string | number;
  computed?: true;
  public?: true;
  jsonPath?: true;
  get_agg?: string;
  attrs?: Array<{in: string; out: string}>;
  attrOf?: string;
  aggregate?: true;
  staticUrl?: string | ((value?: IJSONValue, row?: IJSONObject) => string);
}

export type TColumnDef = IColumnDef | string;

export interface IColumnMap {
  [field: string]: TColumnDef;
}

export interface IModelFilter {
  leftJoins?: IJoinDef[];
  innerJoins?: IJoinDef[];
  conditions?: string[];
  params?: IJSONObject;
}

export interface IPostgresModelContext extends IModelContext {
  tx: IBaseProtocol<any>;
  url: string;
  org: string;
}

export default abstract class PostgresModel implements IModel {
  public abstract readonly table: string;
  public abstract readonly columnMap: IColumnMap;
  public abstract readonly schema: ISchema;

  public abstract readonly defaultFields?: Set<string>;
  public abstract readonly defaultSorts?: string[];
  public abstract readonly defaultPage?: IPage;

  /**
   * "Private" properties to override
   */
  protected leftJoins: IJoinDef[] = [];
  protected innerJoins: IJoinDef[] = [];
  protected tags: { [tag: string]: (opts: IPostgresModelContext) => string } = {};
  protected textId = false;

  public getOne({ options, id, fields }: {
    options: IPostgresModelContext;
    id: string;
    fields: Set<string> | null;
  }) {
    const action = 'getOne';
    return this._checkPermissions({ action, options, id })
      .then(restricted => this.generateSelectFilter({ id, action, options })
        .then(filterOptions => generateSelect({
          fields,
          restricted,
          filterOptions,
          modelOptions: this
        })))
      .then(([query, params]) => options.tx.manyOrNone(query, params))
      .then(expectSingleRow)
      .then(this.mapOne(options));
  }

  public getSome({ options, ids, fields, sorts, filters, page }: {
    options: IPostgresModelContext;
    ids: string[];
    fields: Set<string> | null;
    sorts: string[] | null;
    filters: IFilters | null;
    page: IPage | null;
  }): PromiseLike<IResourceData[]> {
    const action = 'getSome';
    return this._checkPermissions({ action, options, ids })
      .then(restricted => this.generateSelectFilter({ ids, action, options })
        .then(filterOptions => generateSelect({
          fields,
          sorts,
          filters,
          page,
          restricted,
          filterOptions,
          modelOptions: this
        })))
      .then(([query, params]) => options.tx.manyOrNone(query, params))
      .then(this.mapSome(options));
  }

  public getAll({ options, fields, sorts, filters, page }: {
    options: IPostgresModelContext;
    fields: Set<string> | null;
    sorts: string[] | null;
    filters: IFilters | null;
    page: IPage | null;
  }): PromiseLike<IResourceData[]> {
    const action = 'getAll';
    return this._checkPermissions({ action, options })
      .then(restricted => this.generateSelectFilter({ action, options })
        .then(filterOptions => generateSelect({
          fields,
          sorts,
          filters,
          page,
          restricted,
          filterOptions,
          modelOptions: this
        })))
      .then(([query, params]) => options.tx.manyOrNone(query, params))
      .then(this.mapSome(options));
  }

  public update(_: IUpdateParams): PromiseLike<IResourceData | boolean | null> {
    return notImplemented();
  }
  public create(_: ICreateParams): PromiseLike<IResourceData> {
    return notImplemented();
  }
  public delete(_: IDeleteParams): PromiseLike<boolean> {
    return notImplemented();
  }

  /**
   * "Private" functions to override
   */
  public get mapResult(): null | ((data: object | IResourceData, options?: object) => IResourceData) {
    if (Object.keys(this.columnMap).some(field => {
      const columnDef = this.columnMap[field];
      return typeof columnDef === 'object' && !!(columnDef.attrs || columnDef.attrOf || columnDef.staticUrl);
    })) {
      return setFunction(this, 'mapResult', baseMapResult);
    } else {
      return setFunction(this, 'mapResult', null);
    }
  }

  public get mapInput(): (data: IResourceData) => IResourceData {
    if (Object.keys(this.columnMap).some(field => {
      const columnDef = this.columnMap[field];
      return typeof columnDef === 'object' && !!columnDef.attrOf;
    })) {
      return setFunction(this, 'mapInput', baseMapInput);
    } else {
      return setFunction(this, 'mapInput', identity);
    }
}

  public getFilter(_?: object): IModelFilter | null {
    return null;
  }

  public actionPermitted(_?: IPostgresModelContext) {
    return true;
  }

  /**
   * Lazy getters: calculated the first time they are being used
   */
  public get conditionSingle(): string {
    Object.defineProperty(this, 'conditionSingle', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: this._selectId() + '=$<id>'
    });
    return this.conditionSingle;
  }

  public get conditionSome(): string {
    Object.defineProperty(this, 'conditionSome', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: this._selectId() + ' IN($<ids:csv>)'
    });
    return this.conditionSome;
  }

  public get hasPublicField(): boolean {
    Object.defineProperty(this, 'hasPublicField', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: Object.keys(this.columnMap).some(field => {
        const columnDef = this.columnMap[field];
        return typeof columnDef === 'object' && !!columnDef.public;
      })
    });
    return this.hasPublicField;
  }

  protected _selectId(): string {
    const columnDef = this.columnMap.id;
    if (typeof columnDef === 'string') {
      return `${this.table}.${columnDef}${(this.textId ? '::text' : '')}`;
    }
    return columnDef.get as string;
  }

  /**
   * Private functions
   */
  protected _getId({ id, options }: { id: string | number, options: IPostgresModelContext }) {
    if (this.tags[id]) {
      id = this.tags[id](options);
    }
    return this.textId ? String(id) : Number(id);
  }

  /**
   * Returns a promise, that resolves true, if the action is permitted in a 'restricted' way,
   *   false, if the action is permitted without restriction,
   *   and rejects with and error, if the action is not permitted.
   */
  protected _checkPermissions({ action, options, id, ids }: {
    action: TModelAction;
    options: IPostgresModelContext;
    id?: string | number;
    ids?: string[] | number[];
  }) {
    return bluebird.resolve(this.actionPermitted(Object.assign({ action, id, ids }, options)))
      .then(permitted => {
        if (permitted === null && this.hasPublicField) {
          return true;
        } else if (permitted) {
          return false;
        } else {
          throw new CustomError('Insufficient permissions', 403);
        }
      });
  }

  protected generateSelectFilter({ action, id, ids, options }: {
    action: TModelAction;
    id?: string | number;
    ids?: Array<string | number>;
    options: IPostgresModelContext;
  }): PromiseLike<IModelFilter> {
    return bluebird.resolve(this.getFilter(Object.assign({ action }, options))).then(modelFilter => {
      const { leftJoins = [], innerJoins = [], conditions = [], params = {} } =  (modelFilter || {});

      switch (action) {
      case 'getOne':
        conditions.push(this.conditionSingle);
        params.id = this._getId({ id: id!, options });
        break;
      case 'getSome':
        conditions.push(this.conditionSome);
        params.ids = ids!.map(_id => this._getId({ id: _id, options }));
        break;
      }

      return { leftJoins, innerJoins, conditions, params };
    });
  }

  protected mapOne(options: IPostgresModelContext) {
    return (row: IResourceData | null) => (row && this.mapResult) ? this.mapResult(row, options) : row;
  }

  protected mapSome(options: IPostgresModelContext) {
    return (rows: IResourceData[]) => {
      const { mapResult } = this;
      return (rows && mapResult)
        ? rows.map(row => mapResult(row, options))
        : rows;
    };
  }
}
