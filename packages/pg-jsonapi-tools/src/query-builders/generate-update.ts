import { IResourceData, CustomError } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';

import applyFilterOptions from './apply-filter-options';
import selectColumns from './select-columns';
import ColumnMap from '../column-map';
import { IJoinDef, IModelFilter } from '../postgres-model';
import { as } from 'pg-promise';

function buildUpdate({ table, updates, conditions, fromlist = [], returning = [] }: {
  table: string;
  updates: string[];
  conditions: string[];
  fromlist?: string[];
  returning?: string[];
}): string {
  let query = 'UPDATE ' + table + '\nSET ' + updates.join(',');

  if (fromlist.length > 0) {
    query += '\nFROM ' + fromlist.join(',');
  }

  query += '\nWHERE ' + conditions.join(' AND ');

  if (returning.length > 0) {
    query += '\nRETURNING ' + returning.join(',');
  }

  return query + ';';
}

export default function generateUpdate({
  table,
  columnMap,
  data,
  leftJoins = [],
  innerJoins = [],
  filterOptions = null
}: {
  table: string;
  columnMap: ColumnMap;
  data: IResourceData | IJSONObject;
  leftJoins?: IJoinDef[];
  innerJoins?: IJoinDef[];
  filterOptions?: IModelFilter | null;
}): [string, IJSONObject] {
  const updates: string[] = [];
  const conditions: string[] = [];
  const fromlist: string[] = [];
  const params: IJSONObject = {};

  ({ innerJoins, leftJoins } = applyFilterOptions({ innerJoins, leftJoins, conditions, params, filterOptions }));

  if (leftJoins.length > 0) {
    // Replace table name with alias (if it isn't a part of a longer table name)
    const alias = '_' + table + '_alias';
    const tablePrefix = new RegExp(`(^|[^\\w_])${table}\\.`, 'g');
    fromlist.push(table + ' AS ' + alias + leftJoins.map(join => `
LEFT JOIN ${join.table} ON ${join.condition.replace(tablePrefix, '$1' + alias + '.')}`).join(''));

    conditions.push(table + '.' + columnMap.id + '=' + alias + '.' + columnMap.id);
  }

  innerJoins.forEach(join => {
    fromlist.push(join.table);
    conditions.push(join.condition);
  });

  let hasComputedUpdate = false;

  for (const field of Object.keys(data)) {
    const { column, set, computed, writable } = columnMap[field];
    if (!writable || field === 'id') {
      throw new CustomError(`Invalid field: ${field}.`, 400);
    }
    if (!column) {
      throw new CustomError('Programmer error: missing set from writable column', 500);
    }
    if (set) {
      updates.push(`${as.name(column)}=${set}`);
    } else {
      updates.push(`${as.name(column)}=$<${column}>`);
    }
    if (computed) {
      hasComputedUpdate = true;
    } else {
      params[column] = data[field];
    }
  }

  if (updates.length === 0) {
    throw new CustomError('Nothing to update.', 400);
  }

  const returning = hasComputedUpdate
    ? selectColumns({ table, columnMap, prefix: '' })
    : [`${table}.${columnMap.id.get} AS id`];

  return [
    buildUpdate({ table, updates, conditions, fromlist, returning }),
    params
  ];
}
