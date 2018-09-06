import { IResourceData, CustomError } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';

import applyFilterOptions from './apply-filter-options';
import selectColumns from './select-columns';
import IColumnMap from '../column-map';
import { IJoinDef, IModelFilter } from '../postgres-model';

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
  columnMap: IColumnMap;
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
    const columnDef = columnMap[field];
    if (field !== 'id' && columnDef.column && columnDef.set) {
      updates.push(`${columnDef.column}=${columnDef.set}`);
      if (columnDef.computed) {
        hasComputedUpdate = true;
      } else {
        params[columnDef.column] = data[field];
      }
    } else {
      throw new CustomError(`Invalid field: ${field}.`, 400);
    }
  }

  if (updates.length === 0) {
    throw new CustomError('Nothing to update.', 400);
  }

  const returning = hasComputedUpdate ? selectColumns({ table, columnMap }) : [`${table}.${columnMap.id}`];

  return [
    buildUpdate({ table, updates, conditions, fromlist, returning }),
    params
  ];
}
