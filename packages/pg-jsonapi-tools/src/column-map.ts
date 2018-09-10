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
  staticUrl?: string;
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
  [field: string]: Column;
} & {
  id: { get: string; }
};

export default IColumnMap;

export interface IColumn {
  column?: string;
  get?: string | false;
  set?: string | false;
  json?: true;
  required?: true;
  hidden?: true;
  public?: true;
  computed?: true;
  default?: string;
  staticUrl?: string;
  attrs?: ReadonlyArray<{readonly in: string; readonly out: string}>;
  attrOf?: string;
  getAgg?: string;
}

export class Column {
  public readonly column?: string;
  public readonly get?: string;
  public readonly set?: string;
  public readonly json: boolean;
  public readonly readable: boolean;
  public readonly writable: boolean;
  public readonly required: boolean;
  public readonly hidden: boolean;
  public readonly public: boolean;
  public readonly computed: boolean;
  public readonly default?: string;
  public readonly staticUrl?: string;
  public readonly attrs?: ReadonlyArray<{
    readonly in: string;
    readonly out: string
  }>;
  public readonly attrOf?: string;
  public readonly getAgg?: string;

  constructor(config: IColumn | string) {
    if (typeof config === 'string') {
      config = { column: config };
    }
    const {
      column,
      get,
      set,
      json = false,
      required = false,
      hidden = false,
      public: pub = false,
      computed = false,
      default: def,
      staticUrl,
      attrs,
      attrOf,
      getAgg
    } = config;

    this.column = column;

    if (get === false) {
      this.readable = false;
    } else {
      this.readable = true;
      this.get = get;
    }

    if (set === false) {
      this.writable = false;
    } else {
      this.writable = true;
      this.set = set;
    }

    this.json = json;
    this.required = required;
    this.hidden = hidden;
    this.public = pub;
    this.computed = computed;
    this.default = def;
    this.staticUrl = staticUrl;
    this.attrs = attrs;
    this.attrOf = attrOf;
    this.getAgg = getAgg;
  }
}

export function col(config: IColumn | string): Column {
  return new Column(config);
}
