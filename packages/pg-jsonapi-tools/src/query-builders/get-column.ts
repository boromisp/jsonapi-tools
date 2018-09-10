import { IJSONObject } from 'jsonapi-types';

import IColumnMap from '../column-map';
import aliasTableInQuery from './alias-table';
import { as } from 'pg-promise';

export default function getColumn(
  columnMap: IColumnMap,
  fieldName: string,
  table: string,
  params: IJSONObject,
  alias: string,
  aggregate?: true
): string | false | undefined {

  const columnDef = columnMap[fieldName];
  if (columnDef) {
    const { get, column, getAgg, readable } = columnDef;
    if (aggregate) {
      return getAgg && aliasTableInQuery(getAgg, table, alias);
    } else if (get) {
      return aliasTableInQuery(get, table, alias);
    } else if (column && readable) {
      return `${alias}.${as.name(column)}`;
    }
  }

  for (const field of Object.keys(columnMap)) {
    const jsonColumnDef = columnMap[field];
    const { get, column, getAgg, json } = jsonColumnDef;
    if (fieldName.startsWith(field) && json && (get || getAgg) && column) {
      const paramName = fieldName.replace(/[^a-zA-Z0-9_]/g, '_') + '__path';
      params[paramName] = fieldName.substring(field.length + 1).split('.');
      if (!aggregate && get) {
        return `${aliasTableInQuery(get, table, alias)}$<${paramName}>`;
      } else if (aggregate) {
        return getAgg && `${aliasTableInQuery(getAgg, table, alias)}$<${paramName}>`;
      }
      return `${alias}.${as.name(column)}#>>$<${paramName}>`;
    }
  }
  return;
}
