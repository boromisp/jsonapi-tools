import IColumnMap, { IColumnDef } from '../column-map';
import { as } from 'pg-promise';

function addObjectParentField(field: string, columnDef: IColumnDef, baseFields: Set<string>) {
  columnDef.attrs!.forEach(subField => {
    baseFields.add(subField.in);
  });
  baseFields.add(field);
}

function addObjectSubField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const parts = field.split('.');
  if (parts.length === 2) {
    const parent = parts[0];
    const columnDef = columnMap[parent];
    if (columnDef && columnDef.attrs) {
      baseFields.add(parent);
      columnDef.attrs.some(subField => {
        if (subField.out === parts[1]) {
          baseFields.add(subField.in);
          return true;
        }
        return false;
      });
    }
  }
}

function removeObjectSubField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const parts = field.split('.');
  if (parts.length !== 2) {
    return;
  }
  const columnDef = columnMap[parts[0]];
  if (!columnDef || !columnDef.attrs) {
    return;
  }
  columnDef.attrs.some(subField => {
    if (subField.out === parts[1]) {
      baseFields.delete(subField.in);
      return true;
    }
    return false;
  });
}

function addField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const columnDef = columnMap[field];
  if (columnDef && columnDef.attrs) {
    return addObjectParentField(field, columnDef, baseFields);
  }
  if (field.indexOf('.') !== -1) {
    return addObjectSubField(field, columnMap, baseFields);
  }
  return baseFields.add(field);
}

function removeField(field: string, columnMap: IColumnMap, baseFields: Set<string>) {
  const columnDef = columnMap[field];
  if (columnDef && columnDef.attrs) {
    baseFields.delete(field);
    return columnDef.attrs.forEach(subField => {
      baseFields.delete(subField.in);
    });
  }
  if (field.indexOf('.') !== -1) {
    return removeObjectSubField(field, columnMap, baseFields);
  }
  return baseFields.delete(field);
}

export default function selectColumns({ columnMap, table, fields = null, restricted = false, prefix = '_' }: {
  columnMap: IColumnMap;
  table: string;
  fields?: Set<string> | null;
  restricted?: boolean;
  prefix?: string
}): string[] {
  if (fields) {
    const baseFields = new Set();

    for (const field of fields) {
      if (field.charAt(0) !== '-' && field.charAt(0) !== '+') {
        addField(field, columnMap, baseFields);
      }
    }

    if (baseFields.size === 0) {
      Object.keys(columnMap).forEach(field => {
        const columnDef = columnMap[field];
        if (!columnDef || !columnDef.hidden) {
          baseFields.add(field);
        }
      });
    }

    for (const field of fields) {
      if (field.charAt(0) === '-') {
        removeField(field.substring(1), columnMap, baseFields);
      } else if (field.charAt(0) === '+') {
        addField(field.substring(1), columnMap, baseFields);
      }
    }
    fields = baseFields;
  }

  const columns = [`${table}.${as.name(columnMap.id.get)}::text AS ${as.alias(`${prefix}id`)}`];
  for (const field of Object.keys(columnMap)) {
    if (field !== 'id' && (!fields || fields.has(field))) {
      const columnDef = columnMap[field];

      if (columnDef && 'get' in columnDef) {
        if (columnDef.get && (fields || !columnDef.hidden) && (!restricted || columnDef.public)) {
          columns.push(`${columnDef.get} AS ${as.alias(prefix + field)}`);
        }
      } else if (columnDef && columnDef.column) {
        if ((fields || !columnDef.hidden) && (!restricted || columnDef.public)) {
          columns.push(`${table}.${as.name(columnDef.column)} AS ${as.alias(prefix + field)}`);
        }
      }
    }
  }
  return columns;
}
