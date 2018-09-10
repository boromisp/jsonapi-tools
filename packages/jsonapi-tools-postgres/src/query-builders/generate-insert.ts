import { IResourceData, CustomError } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';

import IColumnMap from '../column-map';
import { as } from 'pg-promise';

function insertReturningColumns(
  table: string,
  columnMap: IColumnMap
): string[] {
  const tableWithPrefix = new RegExp('(^|[^\\w_])' + table + '\\.');
  const tableName = new RegExp(table + '\\.', 'g');

  const columns = [`${columnMap.id.get} AS id`];

  for (const field of Object.keys(columnMap)) {
    if (field === 'id') {
      continue;
    }
    const { get, column, hidden, readable } = columnMap[field];
    if (!readable || hidden) {
      continue;
    }
    if (get) {
      if (get.match(tableWithPrefix)) {
        columns.push(`${get.replace(tableName, '')} AS ${as.alias(field)}`);
      }
    } else {
      columns.push(`${as.name(column)} AS ${as.alias(field)}`);
    }
  }
  return columns;
}

function buildInsert({ table, columns, values, returning = [] }: {
  table: string;
  columns: string[];
  values: string[];
  returning?: string[];
}): string {
  let query = 'INSERT INTO ' + table + '(' + columns.join(',') + ')\nVALUES(' + values.join(',') + ')';

  if (returning.length > 0) {
    query += '\nRETURNING ' + returning.join(',');
  }

  return query + ';';
}

export default function generateInsert({ table, columnMap, data }: {
  table: string;
  columnMap: IColumnMap;
  data: IResourceData | IJSONObject;
}): [string, IJSONObject] {

  const params: IJSONObject = {};
  const columns: string[] = [];
  const values: string[] = [];
  const errors: CustomError[] = [];

  for (const field of Object.keys(columnMap)) {
    const { column, set, default: def, required, computed, writable } = columnMap[field];
    if (!writable || field === 'id') {
      continue;
    }
    if (!column) {
      throw new CustomError('Programmer error: writable field has no column', 500);
    }
    if (data[field] === undefined) {
      if (required) {
        errors.push(Object.assign(new CustomError(`Required field is missing: ${field}.`, 409), {
          code: 301,
          title: 'Required field missing',
          source: { pointer: '/data/*/' + field }
        }));
        continue;
      } else if (def !== undefined) {
        params[column] = def;
      }
    } else {
      params[column] = data[field];
    }
    if (!set) {
      throw new CustomError('Programmer error: writable field has no setter', 500);
    }
    if (column in params || computed) {
      columns.push(column);
      values.push(set);
    }
  }

  if (errors.length > 0) {
    throw errors;
  }

  return [
    buildInsert({
      table,
      columns,
      values,
      returning: insertReturningColumns(table, columnMap)
    }),
    params
  ];
}
