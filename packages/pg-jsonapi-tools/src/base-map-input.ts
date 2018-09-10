import PostgresModel from './postgres-model';
import { IResourceData } from 'jsonapi-tools';

export default function (data: IResourceData, _: any, model: PostgresModel): IResourceData {
  Object.keys(data).forEach(field => {
    const columnDef = model.columnMap[field];
    if (columnDef && columnDef.attrs) {
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
