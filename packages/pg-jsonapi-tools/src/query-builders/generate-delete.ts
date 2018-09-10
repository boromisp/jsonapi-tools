import { IJSONObject } from 'jsonapi-types';

import applyFilterOptions from './apply-filter-options';
import ColumnMap from '../column-map';
import { IModelFilter, IJoinDef } from '../postgres-model';

function buildDelete({ table, conditions, using = [], returning = [] }: {
  table: string;
  conditions: string[];
  using?: string[];
  returning?: string[];
}): string {
  let query = 'DELETE FROM ' + table;

  if (using.length > 0) {
    query += '\nUSING ' + using.join(',');
  }

  query += '\nWHERE ' + conditions.join(' AND ');

  if (returning.length > 0) {
    query += '\nRETURNING ' + returning.join(',');
  }
  return query + ';';
}

export default function generateDelete({ table, columnMap, filterOptions = null, leftJoins = [], innerJoins = [] }: {
  table: string;
  columnMap: ColumnMap;
  filterOptions?: IModelFilter | null;
  leftJoins?: IJoinDef[];
  innerJoins?: IJoinDef[];
}): [string, IJSONObject] {
  const conditions: string[] = [];
  const using: string[] = [];
  const params: IJSONObject = {};

  ({ innerJoins, leftJoins } = applyFilterOptions({ innerJoins, leftJoins, conditions, params, filterOptions }));

  if (leftJoins.length > 0) {
    const alias = '_' + table + '_alias';
    const tableWithPrefix = new RegExp('(^|[^\\w_])' + table + '\\.', 'g');

    using.push(table + ' AS ' + alias + leftJoins.map(join => `
LEFT JOIN ${join.table} ON ${join.condition.replace(tableWithPrefix, '$1' + alias + '.')}`).join(''));

    conditions.push(table + '.' + columnMap.id.get + '=' + alias + '.' + columnMap.id.get);
  }

  innerJoins.forEach(join => {
    using.push(join.table);
    conditions.push(join.condition);
  });

  const returning = [`${table}.${columnMap.id.get}`];

  return [
    buildDelete({ table, conditions, using, returning }),
    params
  ];
}
