import { IBaseProtocol } from 'pg-promise';
import * as bluebird from 'bluebird';
import { IJSONObject, IRelationshipObject } from 'jsonapi-types';
import {
  IModel,
  ISchema,
  IPage,
  IModelContext,
  IResourceData,
  IFilters,
  CustomError,
  IParsedIncludes,
  IModels,
  IRelationshipSchema,
  IParsedQueryFields
} from 'jsonapi-tools';

import IColumnMap from './column-map';
import baseMapInput from './base-map-input';
import baseMapResult from './base-map-result';
import { generateSelect, generateUpdate, generateInsert, generateDelete } from './query-builders';
import NestHydrationJS from 'nesthydrationjs';
const nestHydrationJS = NestHydrationJS();

export interface IPostgresModelContext extends IModelContext {
  tx: IBaseProtocol<any>;
  url: string;
  org: string;
  models: IModels;
}

export interface IJoinDef {
  table: string;
  condition: string;
}

export interface IPostgresModelOptions {
  leftJoins?: IJoinDef[];
  innerJoins?: IJoinDef[];
  tags?: { [tag: string]: (opts: IPostgresModelContext) => string };
  textId?: false;
  defaultFields?: Set<string>;
  defaultSorts?: string[];
  defaultPage?: IPage;
}

export type TModelAction = 'getOne' | 'getSome' | 'getAll' | 'create' | 'update' | 'delete';

export interface IModelFilter {
  leftJoins?: IJoinDef[];
  innerJoins?: IJoinDef[];
  conditions?: string[];
  params?: IJSONObject;
}

function setFunction(obj: object, name: string | number | symbol, fn: any): any {
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: fn
  });
  return fn;
}

function identity<T>(x: T): T { return x; }
function notNull(x: any): boolean { return x !== null; }

function expectSingleRow(rows: IResourceData[]): IResourceData | null {
  if (rows.length > 1) {
    throw new CustomError('Multiple rows were not expected', 409);
  } else if (rows.length === 1) {
    return rows[0];
  } else {
    return null;
  }
}

export interface IPostgresRelationshipSchema extends IRelationshipSchema {
  getModel(): PostgresModel;
}

export interface IPostgresSchema extends ISchema {
  relationships?: { [key: string]: IPostgresRelationshipSchema };
  getModel(): PostgresModel;
}

export default class PostgresModel implements IModel {
  public readonly table: string;
  public readonly columnMap: IColumnMap;
  public readonly schema: IPostgresSchema;

  /**
   * "Private" properties to override
   */
  protected leftJoins: IJoinDef[] = [];
  protected innerJoins: IJoinDef[] = [];
  protected tags: { [tag: string]: (opts: IPostgresModelContext) => string } = {};
  protected textId = false;

  constructor(schema: IPostgresSchema, table: string, columnMap: IColumnMap, rest?: IPostgresModelOptions) {
    this.schema = schema;
    this.table = table;
    this.columnMap = columnMap;

    if (rest) {
      for (const key of Object.getOwnPropertyNames(rest) as Array<keyof IPostgresModelOptions>) {
        Object.defineProperty(this, key, Object.getOwnPropertyDescriptor(rest, key)!);
      }
    }
  }

  public getOne({ options, id, fields, includes }: {
    options: IPostgresModelContext;
    id: string;
    fields: IParsedQueryFields | null;
    includes?: IParsedIncludes | null;
  }): PromiseLike<IResourceData | null> {
    const action = 'getOne';
    return this._checkPermissions({ action, options, id })
      .then(restricted => this.generateSelectFilter({ id, action, options })
        .then(filterOptions => generateSelect({
          fields,
          includes,
          restricted,
          filterOptions,
          modelOptions: this
        })))
      .then(([query, params]) => (options.tx.manyOrNone(query, params) as PromiseLike<IResourceData[]>))
      .then(rows => nestHydrationJS.nest(rows))
      .then(expectSingleRow)
      .then(row => this.mapOne(options, row));
  }

  public getSome({ options, ids, fields, sorts, filters, page, includes }: {
    options: IPostgresModelContext;
    ids: string[];
    fields: IParsedQueryFields | null;
    sorts: string[] | null;
    filters: IFilters | null;
    page: IPage | null;
    includes?: IParsedIncludes | null;
  }): PromiseLike<IResourceData[]> {
    const action = 'getSome';
    return this._checkPermissions({ action, options, ids })
      .then(restricted => this.generateSelectFilter({ ids, action, options })
        .then(filterOptions => generateSelect({
          fields,
          sorts,
          filters,
          page,
          includes,
          restricted,
          filterOptions,
          modelOptions: this
        })))
      .then(([query, params]) => (options.tx.manyOrNone(query, params) as PromiseLike<IResourceData[]>))
      .then(rows => nestHydrationJS.nest(rows))
      .then(this.mapSome(options));
  }

  public getAll({ options, fields, sorts, filters, page, includes }: {
    options: IPostgresModelContext;
    fields: IParsedQueryFields | null;
    sorts: string[] | null;
    filters: IFilters | null;
    page: IPage | null;
    includes?: IParsedIncludes | null;
  }): PromiseLike<IResourceData[]> {
    const action = 'getAll';
    return this._checkPermissions({ action, options })
      .then(restricted => this.generateSelectFilter({ action, options })
        .then(filterOptions => generateSelect({
          fields,
          sorts,
          filters,
          page,
          includes,
          restricted,
          filterOptions,
          modelOptions: this
        })))
      .then(([query, params]) => (options.tx.manyOrNone(query, params) as PromiseLike<IResourceData[]>))
      .then(rows => nestHydrationJS.nest(rows))
      .then(this.mapSome(options));
  }

  public update({ options, id, data }: {
    options: IPostgresModelContext;
    id: string;
    data: IJSONObject;
  }): PromiseLike<IResourceData | boolean | null> {
    const action = 'update';
    const { table, columnMap, innerJoins, leftJoins} = this;
    return this._checkPermissions({ action, options })
      .then(() => this.generateWriteFilter({ id, action, options }))
      .then(filterOptions => generateUpdate({
        table,
        columnMap,
        innerJoins,
        leftJoins,
        filterOptions,
        data: this.mapUserData(options)(data)
      }))
      .then(([query, params]) => (options.tx.oneOrNone(query, params) as PromiseLike<IResourceData | null>))
      .then(this.mapUpdate(options));
  }

  public create({ options, data }: {
    options: IPostgresModelContext;
    data: IJSONObject;
  }): PromiseLike<IResourceData> {
    const { table, columnMap } = this;
    return this._checkPermissions({ action: 'create', options })
      .then(() => generateInsert({
        table,
        columnMap,
        data: this.mapUserData(options)(data)
      }))
      .then(([query, params]) => (options.tx.one(query, params) as PromiseLike<IResourceData>))
      .then(row => this.mapOne(options, row));
  }

  public delete({ options, id }: {
    options: IPostgresModelContext;
    id: string;
  }): PromiseLike<boolean> {
    const action = 'delete';
    const { table, columnMap, innerJoins, leftJoins} = this;
    return this._checkPermissions({ action, options })
      .then(() => this.generateWriteFilter({ id, action, options }))
      .then(filterOptions => generateDelete({
        table,
        columnMap,
        innerJoins,
        leftJoins,
        filterOptions
      }))
      .then(([query, params]) => options.tx.oneOrNone(query, params))
      .then(notNull);
  }

  /**
   * "Private" functions to override
   */
  public get mapResult(): null | (
    (data: IResourceData, options?: IPostgresModelContext) => IResourceData
  ) {
    if (Object.keys(this.columnMap).some(field => {
      const columnDef = this.columnMap[field];
      return 'attrs' in columnDef || 'attrOf' in columnDef || 'staticUrl' in columnDef;
    })) {
      return setFunction(this, 'mapResult', baseMapResult);
    } else {
      return setFunction(this, 'mapResult', null);
    }
  }

  public get mapInput(): (data: IResourceData, options?: IPostgresModelContext) => IResourceData {
    if (Object.keys(this.columnMap).some(field => 'attrOf' in this.columnMap[field])) {
      return setFunction(this, 'mapInput', baseMapInput);
    } else {
      return setFunction(this, 'mapInput', identity);
    }
  }

  public getFilter(_?: object): IModelFilter | null {
    return null;
  }

  public actionPermitted(_?: IPostgresModelContext): boolean {
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
      value: Object.keys(this.columnMap).some(field => !!this.columnMap[field].public)
    });
    return this.hasPublicField;
  }

  protected _selectId(): string {
    return this.columnMap.id.get;
  }

  /**
   * Private functions
   */
  protected _getId({ id, options }: { id: string | number, options: IPostgresModelContext }): string | number {
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
  }): PromiseLike<boolean> {
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
    action: 'getOne' | 'getSome' | 'getAll';
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

  protected generateWriteFilter({ action, id, options }: {
    action: 'update' | 'delete';
    id: string;
    options: IPostgresModelContext;
  }): PromiseLike<IModelFilter> {
    return bluebird.resolve(this.getFilter(Object.assign({ action }, options))).then(modelFilter => {
      const { leftJoins = [], innerJoins = [], conditions = [], params = {} } =  (modelFilter || {});

      switch (action) {
      case 'update':
      case 'delete':
        conditions.push(this.conditionSingle);
        params.id = this._getId({ id, options });
        break;
      }
      return { leftJoins, innerJoins, conditions, params };
    });
  }

  protected mapOne(options: IPostgresModelContext, row: IResourceData): IResourceData;
  protected mapOne(options: IPostgresModelContext, row: null): null;
  protected mapOne(options: IPostgresModelContext, row: IResourceData | null): IResourceData | null;
  protected mapOne(options: IPostgresModelContext, row: IResourceData | null): IResourceData | null {
    if (row === null) {
      return null;
    }
    if (!this.mapResult) {
      return row;
    }
    return this.mapResult(row, options);
  }

  protected mapSome(options: IPostgresModelContext):  (rows: IResourceData[]) => IResourceData[] {
    const { mapResult } = this;
    if (mapResult) {
      return (rows: IResourceData[]) => rows.map(row => mapResult(row, options));
    }
    return identity;
  }

  protected mapUpdate(options: IPostgresModelContext): (row: IResourceData | null) => IResourceData | null | boolean {
    return (row: IResourceData | null) => {
      if (row === null) {
        return false;
      } else if (row && Object.keys(row).length === 1) {
        return true;
      }
      return this.mapOne(options, row);
    };
  }

  protected mapUserData(options: IPostgresModelContext): (data: IJSONObject) => IResourceData | IJSONObject {
    return (data: IJSONObject) => {
      const rels = this.schema.relationships;
      if (data && rels) {
        for (const relationship of Object.keys(rels)) {
          const link = data[relationship] as any as IRelationshipObject | null;
          if (link) {
            if (Array.isArray(link.data)) {
              data[relationship] = link.data.map(item => item.id);
            } else if (link.data) {
              data[relationship] = parseInt(link.data.id, 10);
            } else {
              data[relationship] = null;
            }
          }
        }
      }
      return this.mapInput ? this.mapInput(data as IResourceData, options) : data;
    };
  }
}
