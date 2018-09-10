import { IFilters, IPage, CustomError, IParsedIncludes, IParsedQueryFields } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';
import { as } from 'pg-promise';

import selectColumns from './select-columns';
import applyFilterOptions from './apply-filter-options';
import getColumn from './get-column';
import filterConditions from './filter-conditions';
import PostgresModel, { IJoinDef, IModelFilter, IPostgresSchema } from '../postgres-model';
import { isImmediateJoin, isIndirectJoin } from '../types/joins';
import aliasTableInQuery, { aliasTableInQueries } from './alias-table';

function mapInnerJoin(join: IJoinDef): string {
  return 'INNER JOIN ' + join.table + ' ON ' + join.condition;
}

function mapLeftJoin(join: IJoinDef): string {
  return 'LEFT JOIN ' + join.table + ' ON ' + join.condition;
}

class TableAliaser {
  private _aliases: Set<string> = new Set();

  public getAlias(table: string): string {
    while (this._aliases.has(table)) {
      table += '$';
    }
    this._aliases.add(table);
    return as.alias(table);
  }
}

function getJoinableIncludes(
  parentSchema: IPostgresSchema,
  includes: IParsedIncludes,
  leftJoins: IJoinDef[],
  columns: string[],
  aliaser: TableAliaser,
  parentAlias: string,
  parentPrefix: string,
  restricted: boolean,
  fields: IParsedQueryFields | null
): IParsedIncludes {
  const joinableIncludes: IParsedIncludes = {};

  for (const field of Object.keys(includes)) {
    const relationship = parentSchema.relationships![field];

    if (isImmediateJoin(relationship) || isIndirectJoin(relationship)) {
      const childAlias = aliaser.getAlias(parentSchema.type + '_' + field);
      const childModel = relationship.getModel();

      if (isImmediateJoin(relationship)) {
        leftJoins.push({
          table: `${childModel.table} AS ${childAlias}`,
          condition: relationship.sqlJoin(parentAlias, childAlias)
        });
      } else {
        const junctionAlias = aliaser.getAlias(`${parentSchema.type}_${field}_junction`);
        leftJoins.push({
          table: `${relationship.junctionTable} AS ${junctionAlias}`,
          condition: relationship.sqlJoins[0](parentAlias, junctionAlias)
        }, {
          table: `${childModel.table} AS ${childAlias}`,
          condition: relationship.sqlJoins[1](junctionAlias, childAlias)
        });
      }

      let prefix = parentPrefix;
      if (relationship.array) {
        prefix += '_';
      }
      prefix += field + '_';

      columns.push.apply(columns, selectColumns({
        columnMap: childModel.columnMap,
        table: childAlias,
        fields: fields && fields[childModel.schema.type],
        restricted,
        prefix
      }));

      joinableIncludes[field] = getJoinableIncludes(
        relationship.getModel().schema,
        includes[field],
        leftJoins,
        columns,
        aliaser,
        childAlias,
        prefix,
        restricted,
        fields
      );
    }
  }
  return joinableIncludes;
}

function aliasJoin(join: IJoinDef, aliaser: TableAliaser, columns: string[], conditions: string[]): void {
  const joinAlias = aliaser.getAlias(join.table);
  join.condition = aliasTableInQuery(join.condition, join.table, joinAlias);

  aliasTableInQueries(columns, join.table, joinAlias);
  aliasTableInQueries(conditions, join.table, joinAlias);

  join.table = joinAlias;
}

export default function generateSelect({
  fields, sorts, filters, page, includes, filterOptions, restricted, lock,
  modelOptions: { schema, table, columnMap, innerJoins, leftJoins }
}: {
  fields: IParsedQueryFields | null;
  sorts?: string[] | null;
  filters?: IFilters | null;
  page?: IPage | null;
  includes?: IParsedIncludes | null;
  filterOptions?: IModelFilter | null;
  modelOptions: PostgresModel,
  restricted: boolean;
  lock?: { strength?: string; tables?: string[]; option?: string; } | null
}): [string, IJSONObject] {
  const aliaser = new TableAliaser();
  const alias = aliaser.getAlias(table);

  const tables = [alias];
  const conditions: string[] = [];
  const params: IJSONObject = {};
  const order: string[] = [];
  const columns = selectColumns({
    table: alias,
    columnMap,
    fields: fields && fields[schema.type],
    restricted
  });

  ({ innerJoins, leftJoins } = applyFilterOptions({
    innerJoins,
    leftJoins,
    conditions,
    params,
    filterOptions
  }));

  aliasTableInQueries(conditions, table, alias);

  for (const join of innerJoins) {
    aliasJoin(join, aliaser, columns, conditions);
  }

  for (const join of leftJoins) {
    aliasJoin(join, aliaser, columns, conditions);
  }

  // const joinableIncludes = includes && getJoinableIncludes(
  if (includes) {
    getJoinableIncludes(
      schema,
      includes,
      leftJoins,
      columns,
      aliaser,
      table,
      '_',
      restricted,
      fields
    );
  }

  tables.push.apply(tables, innerJoins.map(mapInnerJoin));

  sorts = sorts || [];
  filters = filters || {};

  // Add order expressions based on the sort fields
  sorts.forEach(field => {
    const descending = field.startsWith('-');
    if (descending) {
      field = field.substring(1);
    }
    const column = getColumn(columnMap, field, table, params, alias);
    if (!column) {
      throw new CustomError(`Cannot order by ${field}.`, 400);
    }
    order.push(`${column}${descending ? ' DESC' : ''}`);
  });

  // Add filter expressions based on the filters object
  filterConditions({ filters, columnMap, table, alias, conditions, params });

  // Pagination filters and offsets
  if (page) {
    const selectId = columnMap.id.get
      ? aliasTableInQuery(columnMap.id.get, table, alias)
      : `${alias}.${columnMap.id.column}`;
    if (page.before || page.after) {
      if (sorts.length > 0) {
        throw new CustomError('Cursor-based pagination does not work with custom ordering.', 400);
      }

      if (page.before) {
        conditions.push(`${selectId} < $<page__before>::int`);
        params.page__before = page.before;
        order.push(`${selectId} DESC`);
      } else {
        conditions.push(`${selectId} > $<page__after>::int`);
        params.page__after = page.after!;
        order.push(`${selectId}`);
      }
    } else if ((page.offset || page.limit) && sorts.length === 0) {
      order.push(`${selectId}`);
    }
  }

  /*
  * Skip LEFT JOINS, that are otherwise unused in the query.
  * This is not needed on PostgreSQL 9.0+
  */

  const usedLeftJoins = leftJoins.filter(join => {
    const joinTableAlias = join.table.split(' AS ').pop()!.split(/\s*\(/).shift() + '.';
    return columns.concat(tables, conditions, order).some(str => str.indexOf(joinTableAlias) !== -1);
  });

  let additionallyUsedLeftJoins;
  do {
    additionallyUsedLeftJoins = leftJoins.filter(join => {
      if (usedLeftJoins.indexOf(join) !== -1) {
        return false;
      }
      const joinTableAlias = join.table.split(' AS ').pop() + '.';
      return usedLeftJoins.some(usedJoin => {
        return usedJoin.condition.indexOf(joinTableAlias) !== -1;
      });
    });
    usedLeftJoins.unshift.apply(usedLeftJoins, additionallyUsedLeftJoins);
  } while (additionallyUsedLeftJoins.length);

  tables.push.apply(tables, usedLeftJoins.map(mapLeftJoin));

  const limit = (page && page.limit) ? Number(page.limit) : null;
  const offset = (page && page.offset) ? Number(page.offset) : null;
  const count = page && page.count;

  if (count === 'yes' || count === 'on') {
    columns.push('(COUNT(*) OVER())::int AS __count');
  }

  let sqlLock = null;
  if (lock && typeof lock === 'object') {
    const lockParts = [lock.strength || 'UPDATE'];
    if (lock.tables && lock.tables.length) {
      lockParts.push('OF', lock.tables.join(', '));
    }
    if (lock.option) {
      lockParts.push(lock.option);
    }
    sqlLock = lockParts.join(' ');
  }

  return [
    buildSelect({ columns, conditions, tables, order, limit, offset, lock: sqlLock }),
    params
  ];
}

function buildSelect({
  columns,
  tables,
  conditions = [],
  groups = [],
  havings = [],
  order = [],
  offset = null,
  limit = null,
  lock = null
}: {
  columns: string[];
  tables: string[];
  conditions?: string[];
  groups?: string[];
  havings?: string[];
  order?: string[];
  offset?: number | null;
  limit?: number | null;
  lock?: string | null;
}): string {
  let query = 'SELECT ' + columns.join(',\n  ') + '\nFROM ' + tables.join('\n');

  if (conditions.length > 0) {
    query += '\nWHERE ' + conditions.join('\n  AND ');
  }

  if (groups.length > 0) {
    query += '\nGROUP BY ' + groups.join(', ');
    if (havings.length > 0) {
      query += '\nHAVING ' + havings.join('\n  AND ');
    }
  }

  if (order.length > 0) {
    query += '\nORDER BY ' +  order.join(',');
  }
  if (typeof offset === 'number' && Number.isInteger(offset)) {
    query += '\nOFFSET ' + offset;
  }
  if (typeof limit === 'number' && Number.isInteger(limit)) {
    query += '\nLIMIT ' + limit;
  }
  if (lock) {
    query += '\nFOR ' + lock;
  }

  return query;
}
