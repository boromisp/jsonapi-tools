import { IFilters, IPage, CustomError, IParsedIncludes, IParsedQueryFields } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';
import { as } from 'pg-promise';

import selectColumns from './select-columns';
import applyFilterOptions from './apply-filter-options';
import getColumn from './get-column';
import filterConditions from './filter-conditions';
import PostgresModel, { IJoinDef, IModelFilter, IPostgresSchema } from '../postgres-model';
import { isJoin, IJoinRelationship } from '../types/joins';
import aliasTableInQuery, { aliasTableInQueries } from './alias-table';

function mapInnerJoin(join: IJoinDef): string {
  return 'INNER JOIN ' + join.table + ' ON ' + join.condition;
}

export function mapLeftJoin(join: IJoinDef): string {
  return 'LEFT JOIN ' + join.table + ' ON ' + join.condition;
}

export function getJunctionAlias(parentType: string, field: string, index: number): string {
  return as.alias(`${parentType}.${field}_junction_${index}`);
}

function ensureRelationshipJoins(
  parentType: string,
  field: string,
  parentAlias: string,
  relationship: IJoinRelationship,
  leftJoins: IJoinDef[]
): {
  childModel: PostgresModel;
  childAlias: string;
} {
  const childAlias = as.alias(parentType + '.' + field);
  const childModel = relationship.getModel();
  const childTable = `${childModel.table} AS ${childAlias}`;

  if (leftJoins.every(join => join.table !== childTable)) {
    if (relationship.junctions) {
      for (const [index, junction] of relationship.junctions.entries()) {
        const junctionAlias = getJunctionAlias(parentType, field, index);
        leftJoins.push({
          table: `${junction.table} AS ${junctionAlias}`,
          condition: junction.sqlJoin(parentAlias, junctionAlias)
        });
        parentAlias = junctionAlias;
      }
    }

    leftJoins.push({
      table: childTable,
      condition: relationship.sqlJoin(parentAlias, childAlias)
    });
  }

  return { childModel, childAlias };
}

export function ensureAllRelationshipJoins(
  parentSchema: IPostgresSchema,
  includes: string[],
  leftJoins: IJoinDef[],
  parentAlias: string
): {
  childModel: PostgresModel;
  childAlias: string;
} {
  let childModel!: PostgresModel;
  let childAlias!: string;

  for (const field of includes) {
    const relationship = parentSchema.relationships![field];
    if (isJoin(relationship)) {
      ({ childModel, childAlias } = ensureRelationshipJoins(
        parentSchema.type,
        field,
        parentAlias,
        relationship,
        leftJoins
      ));
      parentSchema = childModel.schema;
      parentAlias = childAlias;
    } else {
      throw new CustomError(`Cannot include ${parentSchema.type}.${field}`, 400);
    }
  }
  return { childModel, childAlias };
}

function getJoinableIncludes(
  parentSchema: IPostgresSchema,
  includes: IParsedIncludes,
  leftJoins: IJoinDef[],
  columns: string[],
  parentAlias: string,
  parentPrefix: string,
  restricted: boolean,
  fields: IParsedQueryFields | null
): IParsedIncludes {
  const joinableIncludes: IParsedIncludes = {};

  for (const field of Object.keys(includes)) {
    const relationship = parentSchema.relationships![field];

    if (isJoin(relationship)) {
      const {
        childModel,
        childAlias
      } = ensureRelationshipJoins(parentSchema.type, field, parentAlias, relationship, leftJoins);

      let prefix = parentPrefix;
      if (relationship.array) {
        prefix += '_';
      }
      prefix += field + '_';

      columns.push.apply(columns, aliasTableInQueries(selectColumns({
        columnMap: childModel.columnMap,
        table: childModel.table,
        fields: fields && fields[childModel.schema.type],
        restricted,
        prefix
      }), childModel.table, childAlias));

      joinableIncludes[field] = getJoinableIncludes(
        childModel.schema,
        includes[field],
        leftJoins,
        columns,
        childAlias,
        prefix,
        restricted,
        fields
      );
    }
  }
  return joinableIncludes;
}

function aliasJoin(join: IJoinDef, joinAlias: string, columns: string[], conditions: string[]): void {
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
  const alias = as.alias(`${schema.type}__main`);

  const tables = [`${table} AS ${alias}`];
  const conditions: string[] = [];
  const params: IJSONObject = {};
  const order: string[] = [];
  const columns = aliasTableInQueries(selectColumns({
    table,
    columnMap,
    fields: fields && fields[schema.type],
    restricted
  }), table, alias);

  ({ innerJoins, leftJoins } = applyFilterOptions({
    innerJoins,
    leftJoins,
    conditions,
    params,
    filterOptions
  }));

  aliasTableInQueries(conditions, table, alias);

  for (const join of innerJoins) {
    aliasJoin(join, as.alias(`${schema.type}__join__${join.table}`), columns, conditions);
  }

  for (const join of leftJoins) {
    aliasJoin(join, as.alias(`${schema.type}__join__${join.table}`), columns, conditions);
  }

  // const joinableIncludes = includes && getJoinableIncludes(
  if (includes) {
    getJoinableIncludes(
      schema,
      includes,
      leftJoins,
      columns,
      alias,
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
  filterConditions({
    schema,
    filters,
    columnMap,
    table,
    alias,
    conditions,
    params,
    leftJoins
  });

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

export function buildSelect({
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
  let query = 'SELECT\n  ' + columns.join(',\n  ') + '\nFROM ' + tables.join('\n');

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

  return query + ';';
}
