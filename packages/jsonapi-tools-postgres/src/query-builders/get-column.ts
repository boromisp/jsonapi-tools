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
    const { get, column, get_agg } = columnDef;
    if (aggregate) {
      return get_agg && aliasTableInQuery(get_agg, table, alias);
    } else if (get) {
      return aliasTableInQuery(get, table, alias);
    } else if (column && get !== false) {
      return `${alias}.${as.name(column)}`;
    }
  }

  for (const field of Object.keys(columnMap)) {
    const jsonColumnDef = columnMap[field];
    const { get, column, get_agg, jsonPath } = jsonColumnDef;
    if (fieldName.startsWith(field) && jsonPath && (get || get_agg) && column) {
      const paramName = fieldName.replace(/[^a-zA-Z0-9_]/g, '_') + '__path';
      params[paramName] = fieldName.substring(field.length + 1).split('.');
      if (!aggregate && get) {
        return `${aliasTableInQuery(get, table, alias)}$<${paramName}>`;
      } else if (aggregate) {
        return get_agg && `${aliasTableInQuery(get_agg, table, alias)}$<${paramName}>`;
      }
      return `${alias}.${as.name(column)}#>>$<${paramName}>`;
    }
  }
  return;
}
