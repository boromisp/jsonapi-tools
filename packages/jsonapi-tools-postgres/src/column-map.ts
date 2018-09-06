import { IJSONValue, IJSONObject } from 'jsonapi-types';

export interface IColumnDef {
  get?: string | false;
  set?: string | false;
  column?: string;
  hidden?: true;
  default?: string | number;
  computed?: true;
  public?: true;
  jsonPath?: true;
  get_agg?: string;
  attrs?: ReadonlyArray<{readonly in: string; readonly out: string}>;
  attrOf?: string;
  aggregate?: true;
  staticUrl?: string | ((value?: IJSONValue, row?: IJSONObject) => string);
  required?: true;
}

export type TColumnDef = IColumnDef;

// export function get(
//   columnDef: TColumnDef, table: string, fields: Set<string> | null, restricted: boolean
// ): sql.SQL | null {
//   if (typeof columnDef === 'string') {
//     if (!restricted) {
//       return sql.join([table, sql.identifier(columnDef)], '.');
//     }
//   } else if ('get' in columnDef) {
//     if (columnDef.get && (fields || !columnDef.hidden) && (!restricted || columnDef.public)) {
//       return columnDef.get;
//     }
//   } else if (columnDef.column) {
//     if ((fields || !columnDef.hidden) && (!restricted || columnDef.public)) {
//       return sql.join([table, sql.identifier(columnDef.column)], '.');
//     }
//   }
//   return null;
// }

// tslint:disable:max-classes-per-file

export class ColumnDef implements IColumnDef {
  public readonly column: string;
  public readonly set: string;

  constructor(column: string) {
    this.column = column;
    this.set = `$<${column}>`;
  }
}

export class ReadOnlyColumnDef implements IColumnDef {
  public readonly column: string;

  constructor(column: string) {
    this.column = column;
  }
}

class ParentColumnDef implements IColumnDef {
  public readonly attrs: ReadonlyArray<{readonly in: string; readonly out: string}>;

  constructor(prefix: string, suffixes: string[]) {
    this.attrs = suffixes.map(suffix => ({
      in: `${prefix}-${suffix}`,
      out: suffix
    }));
  }
}

class ChildColumnDef extends ColumnDef {
  public readonly attrOf: string;

  constructor(prefix: string, column: string) {
    super(column);
    this.attrOf = prefix;
  }
}

const supportedLanguages = ['hu-hu', 'en-gb', 'de-de', 'sk-sk'];

function structuredColumnDef(suffixes: string[], prefix: string): { [field: string]: TColumnDef; } {
  const columnMap: {
    [field: string]: TColumnDef;
  } = {};

  columnMap[prefix] = new ParentColumnDef(prefix, suffixes);

  for (const suffix of suffixes) {
    const field = `${prefix}-${suffix}`;
    columnMap[field] = new ChildColumnDef(prefix, field.replace(/-/g, '_'));
  }

  return columnMap;
}

export const localizedColumns = structuredColumnDef(supportedLanguages, 'descr');
export const colorColumns = structuredColumnDef(['r', 'g', 'b'], 'color');

type IColumnMap = {
  [field: string]: TColumnDef;
} & {
  id: { get: string; }
};

export default IColumnMap;
