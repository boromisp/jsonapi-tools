import { IJSONObject } from 'jsonapi-types';

import IColumnMap from '../column-map';
import aliasTableInQuery from './alias-table';

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
    if (!aggregate && 'get' in columnDef) {
      return columnDef.get && aliasTableInQuery(columnDef.get, table, alias);
    } else if (!aggregate && columnDef.column) {
      return `${alias}.${columnDef.column}`;
    } else if (aggregate) {
      return columnDef.get_agg && aliasTableInQuery(columnDef.get_agg, table, alias);
    }
  }

  for (const field of Object.keys(columnMap)) {
    const jsonColumnDef = columnMap[field];
    if (jsonColumnDef
      && jsonColumnDef.jsonPath
      && fieldName.startsWith(field)
      && (jsonColumnDef.get || jsonColumnDef.column)
    ) {
      const paramName = fieldName.replace(/[^a-zA-Z0-9_]/g, '_') + '__path';
      params[paramName] = fieldName.substring(field.length + 1).split('.');
      if (!aggregate && jsonColumnDef.get) {
        return `${aliasTableInQuery(jsonColumnDef.get, table, alias)}$<${paramName}>`;
      } else if (aggregate) {
        return jsonColumnDef.get_agg && `${aliasTableInQuery(jsonColumnDef.get_agg, table, alias)}$<${paramName}>`;
      }
      return `${alias}.${jsonColumnDef.column}#>>$<${paramName}>`;
    }
  }
  return;
}
