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
