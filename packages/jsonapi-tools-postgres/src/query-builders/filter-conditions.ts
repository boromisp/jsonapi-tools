import getColumn from './get-column';
import { CustomError, TFilter, IFilters } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';
import IColumnMap from '../column-map';

function processFilterCondition({ filter, column, paramName, conds, params }: {
  filter: TFilter;
  column: string;
  paramName: string;
  conds: string[];
  params: IJSONObject;
}): void {
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
      conds.push(`${column} > $<${paramName}__gt>`);
      params[`${paramName}__gt`] = filter.gt;
    }
    if (filter.gte) {
      conds.push(`${column} >= $<${paramName}__gte>`);
      params[`${paramName}__gte`] = filter.gte;
    }
    if (filter.lt) {
      conds.push(`${column} < $<${paramName}__lt>`);
      params[`${paramName}__lt`] = filter.lt;
    }
    if (filter.lte) {
      conds.push(`${column} <= $<${paramName}__lte>`);
      params[`${paramName}__lte`] = filter.lte;
    }
    if (filter.eq) {
      conds.push(`${column} = $<${paramName}__eq>`);
      params[`${paramName}__eq`] = filter.eq;
    }
    if (filter.ne) {
      conds.push(`${column} <> $<${paramName}__ne>`);
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
        m2mValues = `%(${m2mValues})%`;

        params[`${paramName}__m2m`] = m2mValues;
        conds.push(`(EXISTS (SELECT 1 FROM unnest(${column}) AS text WHERE text SIMILAR TO $<${paramName}__m2m>))`);
      }
    }

    if (filter.pattern) {
      params[`${paramName}__pattern`] = filter.pattern;
      conds.push(`(${column}::text ILIKE $<${paramName}__pattern>)`);
    }

    if (filter.contains) {
      const containsValues = filter.contains.split(',').map(value => value.trim()).filter(Boolean);

      if (containsValues && containsValues.length > 0) {
        params[`${paramName}__contains`] = containsValues;
        conds.push(`(${column} @> $<${paramName}__contains>)`);
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

export default function filterConditions(
  { filters, columnMap, table, alias, conditions, aggConditions, params, prefix = '' }: {
  filters: IFilters;
  columnMap: IColumnMap;
  table: string;
  alias: string;
  conditions: string[];
  aggConditions?: string[];
  params: IJSONObject;
  prefix?: string;
}): void {
  Object.keys(filters).forEach(field => {
    if (field === 'or') {
      const or: string[] = [];
      const orAggregate: string[] = [];
      filterConditions({
        filters: filters.or!,
        columnMap,
        table,
        alias,
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
    const column = getColumn(columnMap, field, table, params, alias);
    if (!column) {
      throw new CustomError(`Cannot filter by ${field}.`, 400);
    }

    const paramName = prefix + field.replace(/[^a-zA-Z0-9$_]/g, '_');

    processFilterCondition({ filter, column, paramName, conds: conditions, params });
    if (filter && typeof filter === 'object' && filter.having) {
      const aggColumn = getColumn(columnMap, field, table, params, alias, true);
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
