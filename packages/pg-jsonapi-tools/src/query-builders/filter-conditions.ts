import getColumn from './get-column';
import { CustomError, TFilter, IFilters, validateIncludes } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';
import ColumnMap from '../column-map';
import { IJoinDef, IPostgresSchema } from '../postgres-model';
import { parseIncludeQuery } from 'jsonapi-tools/lib/adapters/express/parse-request';
import { ensureAllRelationshipJoins } from './generate-select';

function processFilterCondition({ filter, column, paramName, conditions, params }: {
  filter: TFilter;
  column: string;
  paramName: string;
  conditions: string[];
  params: IJSONObject;
}): void {
  if (typeof filter === 'string') {
    // ?filters[field]=value
    // Simple equality check
    conditions.push(`${column}::text IN($<${paramName}__filter:csv>)`);
    params[`${paramName}__filter`] = filter.split(',');
  } else {
    // ?filters[field][gt]=value
    // ?filters[field][in]=values
    // ...
    // More specific filter expressions
    if (filter.gt) {
      conditions.push(`${column} > $<${paramName}__gt>`);
      params[`${paramName}__gt`] = filter.gt;
    }
    if (filter.gte) {
      conditions.push(`${column} >= $<${paramName}__gte>`);
      params[`${paramName}__gte`] = filter.gte;
    }
    if (filter.lt) {
      conditions.push(`${column} < $<${paramName}__lt>`);
      params[`${paramName}__lt`] = filter.lt;
    }
    if (filter.lte) {
      conditions.push(`${column} <= $<${paramName}__lte>`);
      params[`${paramName}__lte`] = filter.lte;
    }
    if (filter.eq) {
      conditions.push(`${column} = $<${paramName}__eq>`);
      params[`${paramName}__eq`] = filter.eq;
    }
    if (filter.ne) {
      conditions.push(`${column} <> $<${paramName}__ne>`);
      params[`${paramName}__ne`] = filter.ne;
    }
    if (filter.in) {
      let inValues = filter.in.split(',');
      if (inValues.indexOf('null') === -1) {
        if (inValues.length > 0) {
          params[`${paramName}__in`] = inValues;
          conditions.push(`${column}::text IN($<${paramName}__in:csv>)`);
        }
      } else {
        inValues = inValues.filter(value => value !== 'null');
        if (inValues.length > 0) {
          params[`${paramName}__in`] = inValues;
          conditions.push(`(${column}::text IN($<${paramName}__in:csv>) OR ${column} IS NULL)`);
        } else {
          conditions.push(`${column} IS NULL`);
        }
      }
    }
    if (filter.nin) {
      let ninValues = filter.nin.split(',');
      if (ninValues.indexOf('null') === -1) {
        if (ninValues.length > 0) {
          params[`${paramName}__nin`] = ninValues;
          conditions.push(`(${column}::text NOT IN($<${paramName}__nin:csv>) OR ${column} IS NULL)`);
        }
      } else {
        ninValues = ninValues.filter(value => value !== 'null');
        if (ninValues.length > 0) {
          params[`${paramName}__nin`] = ninValues;
          conditions.push(`(${column}::text NOT IN($<${paramName}__nin:csv>) AND ${column} IS NOT NULL)`);
        } else {
          conditions.push(`${column} IS NOT NULL`);
        }
      }
    }
    if (filter.m2m) {
      let m2mValues = filter.m2m.split(',').map(value => value.trim()).filter(Boolean).join('|');

      if (m2mValues) {
        m2mValues = `%(${m2mValues})%`;

        params[`${paramName}__m2m`] = m2mValues;
        conditions.push(
          `(EXISTS (SELECT 1 FROM unnest(${column}) AS text WHERE text SIMILAR TO $<${paramName}__m2m>))`
        );
      }
    }

    if (filter.pattern) {
      params[`${paramName}__pattern`] = filter.pattern;
      conditions.push(`(${column}::text ILIKE $<${paramName}__pattern>)`);
    }

    if (filter.contains) {
      const containsValues = filter.contains.split(',').map(value => value.trim()).filter(Boolean);

      if (containsValues && containsValues.length > 0) {
        params[`${paramName}__contains`] = containsValues;
        conditions.push(`(${column} @> $<${paramName}__contains>)`);
      }
    }

    if (filter['contains-ts']) {
      const rangeParamName = `${paramName}__contains_ts`;
      params[rangeParamName] = filter['contains-ts']!;
      conditions.push(`(${column} @> $<${rangeParamName}>::timestamptz)`);
    }

    if (filter.is !== undefined) {
      switch (filter.is) {
      case 'true':
        conditions.push(`${column}`);
        break;
      case 'false':
        conditions.push(`NOT ${column}`);
        break;
      case 'not_true':
        conditions.push(`${column} IS DISTINCT FROM TRUE`);
        break;
      case 'not_false':
        conditions.push(`${column} IS DISTINCT FROM FALSE`);
        break;
      default:
        conditions.push(`${column} IS NULL`);
      }
    }
    if (filter.null !== undefined) {
      if (filter.null === 'true') {
        conditions.push(`${column} IS NULL`);
      } else {
        conditions.push(`${column} IS NOT NULL`);
      }
    }
  }
}

export default function filterConditions({
  schema,
  filters,
  columnMap,
  table,
  alias,
  conditions,
  aggConditions,
  params,
  prefix = '',
  leftJoins
}: {
  schema: IPostgresSchema;
  filters: IFilters;
  columnMap: ColumnMap;
  table: string;
  alias: string;
  conditions: string[];
  aggConditions?: string[];
  params: IJSONObject;
  prefix?: string;
  leftJoins: IJoinDef[];
}): void {
  for (const field of Object.keys(filters)) {
    if (field === 'or') {
      const or: string[] = [];
      const orAggregate: string[] = [];
      filterConditions({
        schema,
        filters: filters.or!,
        columnMap,
        table,
        alias,
        conditions: or,
        aggConditions: orAggregate,
        params,
        prefix: 'or__',
        leftJoins
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
    let column = getColumn(columnMap, field, table, params, alias);
    if (!column && field.indexOf('.') !== -1) {
      const parts = field.split('.');
      const lastPart = parts.pop()!;
      const includes = parseIncludeQuery(parts.join('.'))!;
      validateIncludes(schema, includes);
      const { childModel, childAlias } = ensureAllRelationshipJoins(
        schema,
        parts,
        leftJoins,
        alias
      );
      column = getColumn(
        childModel.columnMap,
        lastPart,
        childModel.table,
        params,
        childAlias
      );
    }
    if (!column) {
      throw new CustomError(`Cannot filter by ${field}.`, 400);
    }

    const paramName = prefix + field.replace(/[^a-zA-Z0-9$_]/g, '_');

    processFilterCondition({ filter, column, paramName, conditions, params });
    if (filter && typeof filter === 'object' && filter.having) {
      const aggColumn = getColumn(columnMap, field, table, params, alias, true);
      if (!aggColumn) {
        throw new CustomError(`Cannot filter the aggregate by ${field}.`, 400);
      }
      if (!aggConditions) {
        throw new CustomError('Programmer error: missing agg. conditions', 500);
      }
      processFilterCondition({
        filter: filter.having!,
        column: aggColumn,
        paramName,
        conditions: aggConditions,
        params
      });
    }
  }
}
