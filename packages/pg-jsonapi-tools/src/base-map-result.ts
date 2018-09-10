import { IJSONObject } from 'jsonapi-types';
import { CustomError, IResourceData } from 'jsonapi-tools';

import PostgresModel, { IPostgresModelContext } from './postgres-model';

export default function baseMapResult(
  row: IResourceData,
  options: IPostgresModelContext,
  model: PostgresModel
): IResourceData {
  for (const fieldName of Object.keys(row)) {
    const columnDef = model.columnMap[fieldName];
    if (columnDef) {
      if (columnDef.attrOf) {
        const target = columnDef.attrOf;
        let targetProp = row[target] as IJSONObject;
        if (!targetProp) {
          targetProp = row[targetProp] = {};
        }
        const targetDef = model.columnMap[target];
        if (targetDef && targetDef.attrs) {
          const attr = targetDef.attrs.find(source => source.in === fieldName);
          if (attr) {
            const out = attr.out;
            targetProp[out] = row[fieldName];
            delete row[fieldName];
          } else {
            throw new CustomError('Programmer error: missing target `attr.out`', 500);
          }
        } else {
          throw new CustomError('Programmer error: invalid target column def', 500);
        }
      } else if (columnDef.staticUrl && row[fieldName] !== null) {
        row[fieldName] = `${options.url}/static${columnDef.staticUrl}/${row[fieldName]}?org=${options.org}`;
      }
    } else {
      for (const field of Object.keys(model.columnMap)) {
        const jsonColumnDef = model.columnMap[field];
        if (jsonColumnDef.attrOf && jsonColumnDef.json && fieldName.startsWith(field)) {
          const target = jsonColumnDef.attrOf;
          let targetProp = row[target] as IJSONObject;
          if (!targetProp) {
            targetProp = row[target] = {};
          }
          targetProp[fieldName] = row[fieldName];
          delete row[fieldName];
        }
      }
    }
  }

  return row;
}
