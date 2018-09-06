import { IResourceData, CustomError } from 'jsonapi-tools';
import { IJSONObject } from 'jsonapi-types';

import IColumnMap from '../column-map';

function insertReturningColumns({ table, columnMap }: {
  table: string;
  columnMap: IColumnMap;
}): string[] {
  const tableWithPrefix = new RegExp('(^|[^\\w_])' + table + '\\.');
  const tableName = new RegExp(table + '\\.', 'g');

  const columns = [columnMap.id.get + '::text AS id'];
  for (const field of Object.keys(columnMap)) {
    const columnDef = columnMap[field];
    if (field !== 'id' && columnDef) {
      if ('get' in columnDef) {
        const expr = columnDef.get;
        if (expr && !columnDef.hidden && expr.match(tableWithPrefix)) {
          columns.push(`${expr.replace(tableName, '')} AS "${field}"`);
        }
      } else if (columnDef.column) {
        if (!columnDef.hidden) {
          columns.push(`${columnDef.column} AS "${field}"`);
        }
      }
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
    if (field !== 'id') {
      const columnDef = columnMap[field];
      if (columnDef.column && columnDef.set) {
        const column = columnDef.column;
        if (!columnDef.computed || (data[field] === undefined && columnDef.default !== undefined)) {
          if (data[field] === undefined) {
            if (columnDef.required) {
              errors.push(Object.assign(new CustomError(`Required field is missing: ${field}.`, 409), {
                code: 301,
                title: 'Required field missing',
                source: { pointer: '/data/*/' + field }
              }));
            } else if (columnDef.default !== undefined) {
              params[column] = columnDef.default;
            }
          } else {
            params[column] = data[field];
          }
        }
        if (data[field] !== undefined || (columnDef.computed && columnDef.default === undefined)) {
          values.push(columnDef.set);
          columns.push(column);
        } else if (params[column] !== undefined) {
          values.push('$<' + column + '>');
          columns.push(column);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw errors;
  }

  const returning = insertReturningColumns({ table, columnMap });

  return [
    buildInsert({ table, columns, values, returning }),
    params
  ];
}
