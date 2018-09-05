import { IJSONObject } from 'jsonapi-types';
import { TFilter, IFilters, IPage, CustomError } from 'jsonapi-tools';

import PostgresModel, { IColumnDef, IColumnMap, IModelFilter, IJoinDef } from '../types/postgres-model';

function addObjectParentField(field: string, columnDef: IColumnDef, baseFields: Set<string>) {
  columnDef.attrs!.forEach(subField => {
    baseFields.add(subField.in);
  });
  baseFields.add(field);
}

function addObjectSubField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const parts = field.split('.');
  if (parts.length === 2) {
    const parent = parts[0];
    const columnDef = columnMap[parent];
    if (columnDef && typeof columnDef !== 'string' && columnDef.attrs) {
      baseFields.add(parent);
      columnDef.attrs.some(subField => {
        if (subField.out === parts[1]) {
          baseFields.add(subField.in);
          return true;
        }
        return false;
      });
    }
  }
}

function removeObjectSubField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const parts = field.split('.');
  if (parts.length !== 2) {
    return;
  }
  const columnDef = columnMap[parts[0]];
  if (!columnDef || typeof columnDef === 'string' || !columnDef.attrs) {
    return;
  }
  columnDef.attrs.some(subField => {
    if (subField.out === parts[1]) {
      baseFields.delete(subField.in);
      return true;
    }
    return false;
  });
}

function addField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const columnDef = columnMap[field];
  if (columnDef && typeof columnDef !== 'string' && columnDef.attrs) {
    return addObjectParentField(field, columnDef, baseFields);
  }
  if (field.indexOf('.') !== -1) {
    return addObjectSubField(field, columnMap, baseFields);
  }
  return baseFields.add(field);
}

function removeField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const columnDef = columnMap[field];
  if (columnDef && typeof columnDef !== 'string' && columnDef.attrs) {
    baseFields.delete(field);
    return columnDef.attrs.forEach(subField => {
      baseFields.delete(subField.in);
    });
  }
  if (field.indexOf('.') !== -1) {
    return removeObjectSubField(field, columnMap, baseFields);
  }
  return baseFields.delete(field);
}

export function selectColumns({ columnMap, table, fields = null, restricted = false }: {
  columnMap: IColumnMap;
  table: string;
  fields?: Set<string> | null;
  restricted?: boolean;
}): string[] {
  if (fields) {
    const baseFields = new Set();

    for (const field of fields) {
      if (field.charAt(0) !== '-' && field.charAt(0) !== '+') {
        addField(field, columnMap, baseFields);
      }
    }

    if (baseFields.size === 0) {
      Object.keys(columnMap).forEach(field => {
        const columnDef = columnMap[field];
        if (!columnDef || typeof columnDef !== 'string' && !columnDef.hidden) {
          baseFields.add(field);
        }
      });
    }

    for (const field of fields) {
      if (field.charAt(0) === '-') {
        removeField(field.substring(1), columnMap, baseFields);
      } else if (field.charAt(0) === '+') {
        addField(field.substring(1), columnMap, baseFields);
      }
    }
    fields = baseFields;
  }

  const columns = [`${table}.${columnMap.id}::text AS id`];
  for (const field of Object.keys(columnMap)) {
    if (field !== 'id' && (!fields || fields.has(field))) {
      const columnDef = columnMap[field];

      if (typeof columnDef === 'string') {
        if (!restricted) {
          columns.push(`${table}.${columnDef} AS "${field}"`);
        }
      } else if (columnDef && 'get' in columnDef) {
        if (columnDef.get && (fields || !columnDef.hidden) && (!restricted || columnDef.public)) {
          columns.push(`${columnDef.get} AS "${field}"`);
        }
      } else if (columnDef && columnDef.column) {
        if ((fields || !columnDef.hidden) && (!restricted || columnDef.public)) {
          columns.push(`${table}.${columnDef.column} AS "${field}"`);
        }
      }
    }
  }
  return columns;
}

export function getColumn(
  columnMap: IColumnMap,
  fieldName: string,
  table: string,
  params: IJSONObject,
  aggregate?: true
): string | false | undefined {
  const fieldDef = columnMap[fieldName];
  if (fieldDef) {
    if (typeof fieldDef === 'string') {
      return table + '.' + fieldDef;
    } else if (!aggregate && 'get' in fieldDef) {
      return fieldDef.get;
    } else if (!aggregate && fieldDef.column) {
      return table + '.' + fieldDef.column;
    } else if (aggregate) {
      return fieldDef.get_agg;
    }
  }

  for (const field of Object.keys(columnMap)) {
    const jsonFieldDef = columnMap[field];
    if (jsonFieldDef
      && typeof jsonFieldDef !== 'string'
      && jsonFieldDef.jsonPath
      && fieldName.startsWith(field)
      && (jsonFieldDef.get || jsonFieldDef.column)
    ) {
      const paramName = fieldName.replace(/[^a-zA-Z0-9_]/g, '_') + '__path';
      params[paramName] = fieldName.substring(field.length + 1).split('.');
      if (!aggregate && jsonFieldDef.get) {
        return `${jsonFieldDef.get}$<${paramName}>`;
      } else if (aggregate) {
        return `${jsonFieldDef.get_agg}$<${paramName}>`;
      }
      return `${table}.${jsonFieldDef.column}#>>$<${paramName}>`;
    }
  }
  return;
}

function processFilterCondition({ filter, column, paramName, conds, params }: {
  filter: TFilter;
  column: string;
  paramName: string;
  conds: string[];
  params: IJSONObject;
}) {
  if (typeof filter === 'string') {
    // ?filters[field]=value
    // Simple equality check
    conds.push(`${column}::text IN($<${paramName}__filter:csv>)`);
    params[`${paramName}__filter`] = filter.split(',');
  } else {
    // ?filters[field][gt]=value
    // ?filters[field][in]=values
    // ...
    // More specific filter expressions
    if (filter.gt) {
      conds.push(`${column}>$<${paramName}__gt>`);
      params[`${paramName}__gt`] = filter.gt;
    }
    if (filter.gte) {
      conds.push(`${column}>=$<${paramName}__gte>`);
      params[`${paramName}__gte`] = filter.gte;
    }
    if (filter.lt) {
      conds.push(`${column}<$<${paramName}__lt>`);
      params[`${paramName}__lt`] = filter.lt;
    }
    if (filter.lte) {
      conds.push(`${column}<=$<${paramName}__lte>`);
      params[`${paramName}__lte`] = filter.lte;
    }
    if (filter.eq) {
      conds.push(`${column}=$<${paramName}__eq>`);
      params[`${paramName}__eq`] = filter.eq;
    }
    if (filter.ne) {
      conds.push(`${column}<>$<${paramName}__ne>`);
      params[`${paramName}__ne`] = filter.ne;
    }
    if (filter.in) {
      let inValues = filter.in.split(',');
      if (inValues.indexOf('null') === -1) {
        if (inValues.length > 0) {
          params[`${paramName}__in`] = inValues;
          conds.push(`${column}::text IN($<${paramName}__in:csv>)`);
        }
      } else {
        inValues = inValues.filter(value => value !== 'null');
        if (inValues.length > 0) {
          params[`${paramName}__in`] = inValues;
          conds.push(`(${column}::text IN($<${paramName}__in:csv>) OR ${column} IS NULL)`);
        } else {
          conds.push(`${column} IS NULL`);
        }
      }
    }
    if (filter.nin) {
      let ninValues = filter.nin.split(',');
      if (ninValues.indexOf('null') === -1) {
        if (ninValues.length > 0) {
          params[`${paramName}__nin`] = ninValues;
          conds.push(`(${column}::text NOT IN($<${paramName}__nin:csv>) OR ${column} IS NULL)`);
        }
      } else {
        ninValues = ninValues.filter(value => value !== 'null');
        if (ninValues.length > 0) {
          params[`${paramName}__nin`] = ninValues;
          conds.push(`(${column}::text NOT IN($<${paramName}__nin:csv>) AND ${column} IS NOT NULL)`);
        } else {
          conds.push(`${column} IS NOT NULL`);
        }
      }
    }
    if (filter.m2m) {
      let m2mValues = filter.m2m.split(',').map(value => value.trim()).filter(Boolean).join('|');

      if (m2mValues) {
        m2mValues = '%(' + m2mValues + ')%';

        params[paramName + '__m2m'] = m2mValues;
        conds.push(`(EXISTS (SELECT 1 FROM unnest(${column}) AS text WHERE text SIMILAR TO $<${paramName}__m2m>))`);
      }
    }

    if (filter.pattern) {
      params[paramName + '__pattern'] = filter.pattern;
      conds.push('('  + column + '::text ILIKE $<' + paramName + '__pattern>)');
    }

    if (filter.contains) {
      const containsValues = filter.contains.split(',').map(value => value.trim()).filter(Boolean);

      if (containsValues && containsValues.length > 0) {
        params[paramName + '__contains'] = containsValues;
        conds.push('(' + column + ' @> $<' + paramName + '__contains>)');
      }
    }

    if (filter['contains-ts']) {
      const rangeParamName = `${paramName}__contains_ts`;
      params[rangeParamName] = filter['contains-ts']!;
      conds.push(`(${column} @> $<${rangeParamName}>::timestamptz)`);
    }

    if (filter.is !== undefined) {
      switch (filter.is) {
      case 'true':
        conds.push(`${column}`);
        break;
      case 'false':
        conds.push(`NOT ${column}`);
        break;
      case 'not_true':
        conds.push(`${column} IS DISTINCT FROM TRUE`);
        break;
      case 'not_false':
        conds.push(`${column} IS DISTINCT FROM FALSE`);
        break;
      default:
        conds.push(`${column} IS NULL`);
      }
    }
    if (filter.null !== undefined) {
      if (filter.null === 'true') {
        conds.push(`${column} IS NULL`);
      } else {
        conds.push(`${column} IS NOT NULL`);
      }
    }
  }
}

export function filterConditions({ filters, columnMap, table, conditions, aggConditions, params, prefix = '' }: {
  filters: IFilters;
  columnMap: IColumnMap;
  table: string;
  conditions: string[];
  aggConditions?: string[];
  params: IJSONObject;
  prefix?: string;
}) {
  Object.keys(filters).forEach(field => {
    if (field === 'or') {
      const or: string[] = [];
      const orAggregate: string[] = [];
      filterConditions({
        filters: filters.or!,
        columnMap,
        table,
        conditions: or,
        aggConditions: orAggregate,
        params,
        prefix: 'or__'
      });
      conditions.push(`(${or.join(' OR ')})`);
      if (aggConditions) {
        aggConditions.push(`(${orAggregate.join(' OR ')})`);
      } else if (orAggregate.length) {
        throw new CustomError('Programmer error: missing agg. conditions', 500);
      }
      return;
    } else if (field === 'grouped-by') {
      return;
    }

    const filter = filters[field];
    const column = getColumn(columnMap, field, table, params);
    if (!column) {
      throw new CustomError(`Cannot filter by ${field}.`, 400);
    }

    const paramName = prefix + field.replace(/[^a-zA-Z0-9$_]/g, '_');

    let conds = conditions;
    const columnDef = columnMap[field];
    if (columnDef && typeof columnDef === 'object' && columnDef.aggregate) {
      if (!aggConditions) {
        throw new CustomError('Programmer error: missing agg. conditions', 500);
      }
      conds = aggConditions;
    }

    processFilterCondition({ filter, column, paramName, conds, params });
    if (filter && typeof filter === 'object' && filter.having) {
      const aggColumn = getColumn(columnMap, field, table, params, true);
      if (!aggColumn) {
        throw new CustomError(`Cannot filter the aggregate by ${field}.`, 400);
      }
      if (!aggConditions) {
        throw new CustomError('Programmer error: missing agg. conditions', 500);
      }
      processFilterCondition({ filter: filter.having!, column: aggColumn, paramName, conds: aggConditions, params });
    }
  });
}

function applyFilterOptions({
  innerJoins, leftJoins, conditions, params, filterOptions
}: {
  innerJoins: IJoinDef[];
  leftJoins: IJoinDef[];
  conditions: string[];
  params: IJSONObject;
  filterOptions?: IModelFilter | null;
}) {
  if (!filterOptions) {
    return { innerJoins, leftJoins };
  }

  if (filterOptions.innerJoins) {
    innerJoins = innerJoins.concat(
      filterOptions.innerJoins.filter(
        joinA => innerJoins.every(
          joinB => joinA.table !== joinB.table
        )
      )
    );
  }

  if (filterOptions.leftJoins) {
    leftJoins = leftJoins.concat(
      filterOptions.leftJoins.filter(
        joinA => leftJoins.every(
          joinB => joinA.table !== joinB.table
        )
      )
    );
  }

  if (filterOptions.params) {
    Object.assign(params, filterOptions.params);
  }

  if (filterOptions.conditions) {
    conditions.push.apply(conditions, filterOptions.conditions);
  }

  return { innerJoins, leftJoins };
}

function mapInnerJoin(join: IJoinDef) {
  return 'INNER JOIN ' + join.table + ' ON ' + join.condition;
}

function mapLeftJoin(join: IJoinDef) {
  return 'LEFT JOIN ' + join.table + ' ON ' + join.condition;
}

function _generateSelect({
  table,
  columnMap,
  fields = null,
  filterOptions = null,
  sorts = [],
  filters = {},
  page = null,
  leftJoins = [],
  innerJoins = [],
  restricted = false,
  lock = null
}: {
  table: string;
  columnMap: IColumnMap;
  fields?: Set<string> | null;
  filterOptions?: IModelFilter | null;
  sorts?: string[] | null;
  filters?: IFilters | null;
  page?: IPage | null;
  leftJoins?: IJoinDef[];
  innerJoins?: IJoinDef[];
  restricted?: boolean;
  lock?: {
    strength?: string;
    tables?: string[]
    option?: string;
  } | null;
}): {
  columns: string[];
  conditions: string[];
  tables: string[];
  order: string[];
  limit: number | null;
  offset: number | null;
  lock: string | null;
  params: IJSONObject;
} {
  const tables = [table];
  const conditions: string[] = [];
  const params: IJSONObject = {};
  const order: string[] = [];
  const columns = selectColumns({ table, columnMap, fields, restricted });

  ({ innerJoins, leftJoins } = applyFilterOptions({ innerJoins, leftJoins, conditions, params, filterOptions }));

  tables.push.apply(tables, innerJoins.map(mapInnerJoin));

  sorts = sorts || [];
  filters = filters || {};

  // Add order expressions based on the sort fields
  sorts.forEach(field => {
    const descending = field.startsWith('-');
    if (descending) {
      field = field.substring(1);
    }
    const column = getColumn(columnMap, field, table, params);
    if (!column) {
      throw Object.assign(new Error(`Cannot order by ${field}.`), { status: 400 });
    }
    order.push(`${column}${descending ? ' DESC' : ''}`);
  });

  // Add filter expressions based on the filters object
  filterConditions({ filters, columnMap, table, conditions, params });

  // Pagination filters and offsets
  if (page) {
    if (page.before || page.after) {
      if (sorts.length > 0) {
        throw Object.assign(new Error('Cursor-based pagination does not work with custom ordering.'), { status: 400 });
      }

      if (page.before) {
        conditions.push(`${table}.${columnMap.id}<$<page__before>::int`);
        params.page__before = page.before;
        order.push(`${table}.${columnMap.id} DESC`);
      } else {
        conditions.push(`${table}.${columnMap.id}>$<page__after>::int`);
        params.page__after = page.after!;
        order.push(`${table}.${columnMap.id}`);
      }
    } else if ((page.offset || page.limit) && sorts.length === 0) {
      order.push(`${table}.${columnMap.id}`);
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

  return { columns, conditions, tables, order, limit, offset, lock: sqlLock, params };
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

export function generateSelect({
  fields,
  sorts,
  filters,
  page,
  filterOptions,
  modelOptions: {
    table,
    columnMap,
    innerJoins,
    leftJoins,
    defaultFields,
    defaultSorts,
    defaultPage
  },
  restricted
}: {
  fields?: Set<string> | null;
  sorts?: string[] | null;
  filters?: IFilters | null;
  page?: IPage | null;
  filterOptions?: IModelFilter | null;
  modelOptions: PostgresModel,
  restricted?: boolean;
}): [string, IJSONObject] {
  const { params, columns, conditions, tables, order, limit, offset, lock } = _generateSelect({
    table,
    columnMap,
    innerJoins,
    leftJoins,
    fields: fields || defaultFields,
    sorts: sorts || defaultSorts,
    filters,
    page: page || defaultPage,
    filterOptions,
    restricted
  });
  return [
    buildSelect({ columns, conditions, tables, order, limit, offset, lock }),
    params
  ];
}

// export function generateSelectFilter(model: IReadableModel, { action, id, ids, options }: {
//   action: TModelAction;
//   id?: string | number;
//   ids?: Array<string | number>;
//   options: object;
// }): PromiseLike<IModelFilter> {
//   return bluebird.resolve(model.getFilter(Object.assign({ action }, options))).then(modelFilter => {
//     const { leftJoins = [], innerJoins = [], conditions = [], params = {} } =  (modelFilter || {});

//     switch (action) {
//     case 'getOne':
//       conditions.push(model.conditionSingle);
//       params.id = model._getId({ id: id!, options });
//       break;
//     case 'getSome':
//       conditions.push(model.conditionSome);
//       params.ids = ids!.map(_id => model._getId({ id: _id, options }));
//       break;
//     }

//     return { leftJoins, innerJoins, conditions, params };
//   });
// }
