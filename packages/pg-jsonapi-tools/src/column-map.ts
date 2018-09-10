// tslint:disable:max-classes-per-file

export const supportedLanguages = ['hu-hu', 'en-gb', 'de-de', 'sk-sk'];

export function structuredColumnDef(suffixes: string[], prefix: string): { [field: string]: IColumn; } {
  const columnMap: {
    [field: string]: IColumn;
  } = {};

  columnMap[prefix] = {
    attrs: suffixes.map(suffix => ({
      in: `${prefix}-${suffix}`,
      out: suffix
    }))
  };

  for (const suffix of suffixes) {
    const field = `${prefix}-${suffix}`;
    const column = field.replace(/-/g, '_');
    columnMap[field] = { column, attrOf: prefix };
  }

  return columnMap;
}

export const localizedColumns = structuredColumnDef(supportedLanguages, 'descr');
export const colorColumns = structuredColumnDef(['r', 'g', 'b'], 'color');

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
  public readonly json?: true;
  public readonly readable: boolean;
  public readonly writable: boolean;
  public readonly required?: true;
  public readonly hidden?: true;
  public readonly public?: true;
  public readonly computed?: true;
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
      json,
      required,
      hidden,
      public: pub,
      computed,
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
      if (get !== undefined) {
        this.get = get;
      }
    }

    if (set === false) {
      this.writable = false;
    } else {
      this.writable = true;
      if (set !== undefined) {
        this.set = set;
      }
    }

    if (json !== undefined) {
      this.json = json;
    }
    if (required !== undefined) {
      this.required = required;
    }
    if (hidden !== undefined) {
      this.hidden = hidden;
    }
    if (pub !== undefined) {
      this.public = pub;
    }
    if (computed !== undefined) {
      this.computed = computed;
    }
    if (def !== undefined) {
      this.default = def;
    }
    if (staticUrl !== undefined) {
      this.staticUrl = staticUrl;
    }
    if (attrs !== undefined) {
      this.attrs = attrs;
    }
    if (attrOf !== undefined) {
      this.attrOf = attrOf;
    }
    if (getAgg !== undefined) {
      this.getAgg = getAgg;
    }
  }
}

export default class ColumnMap {
  public readonly id!: Column;
  readonly [field: string]: Column;

  constructor(columns: { [field: string]: IColumn | string }) {
    if (!columns.id) {
      this.id = new Column('id');
    }

    const propertyDescriptors = columns as any as PropertyDescriptorMap;
    for (const field of Object.keys(columns)) {
      propertyDescriptors[field] = {
        configurable: false,
        enumerable: true,
        writable: false,
        value: new Column(columns[field]),
      };
    }
    Object.defineProperties(this, propertyDescriptors);
  }
}

export function col(config: IColumn | string): Column {
  return new Column(config);
}
