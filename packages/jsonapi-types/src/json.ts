export type IJSONValue = null | string | number | boolean | Date | IJSONObject | IJSONArray;

export interface IJSONObject {
  [x: string]: IJSONValue;
}

// tslint:disable-next-line:no-empty-interface
export interface IJSONArray extends Array<IJSONValue> {}
