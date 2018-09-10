import ColumnMap, { Column } from '../column-map';
import { as } from 'pg-promise';

function addObjectParentField(field: string, columnDef: Column, baseFields: Set<string>): void {
  columnDef.attrs!.forEach(subField => {
    baseFields.add(subField.in);
  });
  baseFields.add(field);
}

function addObjectSubField(field: string, columnMap: ColumnMap, baseFields: Set<string>): void {
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

function removeObjectSubField(field: string, columnMap: ColumnMap, baseFields: Set<string>): void {
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

function addField(field: string, columnMap: ColumnMap, baseFields: Set<string>): void {
  const columnDef = columnMap[field];
  if (columnDef && columnDef.attrs) {
    return addObjectParentField(field, columnDef, baseFields);
  }
  if (field.indexOf('.') !== -1) {
    return addObjectSubField(field, columnMap, baseFields);
  }
  baseFields.add(field);
}

function removeField(field: string, columnMap: ColumnMap, baseFields: Set<string>): void {
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
  baseFields.delete(field);
}

function preprocessFields(fields: Set<string>, columnMap: ColumnMap): Set<string> {
  const baseFields = new Set();

  for (const field of fields) {
    if (!field.startsWith('-') && !field.startsWith('+')) {
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
    if (field.startsWith('-')) {
      removeField(field.substring(1), columnMap, baseFields);
    } else if (field.startsWith('+')) {
      addField(field.substring(1), columnMap, baseFields);
    }
  }

  return baseFields;
}

export default function selectColumns({ columnMap, table, fields = null, restricted = false, prefix = '_' }: {
  columnMap: ColumnMap;
  table: string;
  fields?: Set<string> | null;
  restricted?: boolean;
  prefix?: string
}): string[] {
  if (fields) {
    fields = preprocessFields(fields, columnMap);
  }

  const columns = [] as string[];
  if (columnMap.id.get) {
    columns.push(`${as.name(columnMap.id.get)}::text AS ${as.alias(`${prefix}id`)}`);
  } else {
    columns.push(`${table}.${as.name(columnMap.id.column)}::text AS ${as.alias(`${prefix}id`)}`);
  }
  for (const field of Object.keys(columnMap)) {
    const { column, get, hidden, public: pub, readable } = columnMap[field];
    if (field === 'id' || fields && !fields.has(field) || !fields && hidden || !pub && restricted) {
      continue;
    }
    if (readable) {
      if (get) {
        columns.push(`${get} AS ${as.alias(prefix + field)}`);
      } else if (column) {
        columns.push(`${table}.${as.name(column)} AS ${as.alias(prefix + field)}`);
      }
    }
  }
  return columns;
}
