import PostgresModel from '../types/postgres-model';
import { IResourceData } from 'jsonapi-tools';

export default function (data: IResourceData, _: any, model: PostgresModel) {
  Object.keys(data).forEach(field => {
    const columnDef = model.columnMap[field];
    if (typeof columnDef === 'object' && columnDef.attrs) {
      const fieldData = data[field];
      if (fieldData) {
        columnDef.attrs.forEach(subField => {
          if (fieldData[subField.out]! !== undefined) {
            data[subField.in] = fieldData[subField.out];
          }
        });
      }
      delete data[field];
    }
  });
  return data;
}
