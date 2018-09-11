import 'jest';

import get, { IGetOneRequestParams, IGetAllRequestParams } from '../get';
import { IModel, IModels, ISchema, IResourceData } from '../../../types/model';

class MockModel implements IModel {
  public schema: ISchema;
  public hasPublicField = false;
  public mapResult = null;

  private _data: IResourceData[];
  private _maxId: number;

  constructor(schema: any, data: IResourceData[] = []) {
    this.schema = buildSchema(schema);
    this._data = data;
    this._maxId = data.reduce((maxId, row) => Math.max(maxId, Number(row.id)), 0);
  }

  public mapInput = x => x;

  public async getOne({ id }) {
    return this._data.find(row => row.id === id) || null;
  }

  public async getSome({ ids }) {
    return this._data.filter(row => ids.some(id => row.id === id));
  }

  public async getAll() {
    return this._data.map(item => {
      item.__count = this._data.length;
      return item;
    });
  }

  public async create({ data }) {
    this._maxId += 1;
    const row = Object.assign({ id: String(this._maxId) }, data);
    this._data.push(row);
    return row;
  }

  public async update({ id, data }) {
    const row = await this.getOne({ id });
    if (row) {
      return Object.assign(row, data);
    }
    return false;
  }

  public async delete({ id }) {
    const i = this._data.findIndex(row => row.id === id);
    if (i === -1) {
      return false;
    }
    this._data.splice(i, 1);
    return true;
  }
}

function buildModels(...args: IModel[]): IModels {
  const models = args.reduce((m, model) => {
    m[model.schema.type] = model;
    return m;
  }, {} as IModels);

  args.forEach(model => {
    const relationships = model.schema.relationships;
    if (relationships) {
      Object.keys(relationships).forEach(field => {
        const relationship = relationships[field];
        relationship.getModel = () => models[relationship.type];
      });
    }
  });
  return models;
}

function buildSchema(schema: any): ISchema {
  return schema;
}

describe('Test getting a single resource', () => {
  let requestParams: IGetOneRequestParams;

  beforeEach(() => {
    const models = {};
    requestParams = {
      method: 'get',
      type: 'my-type',
      id: '1',
      fields: null,
      includes: null,
      options: { models },
      models,
      baseUrl: ''
    };
  });

  test('Throws if model not found', () => {
    expect.assertions(1);
    return get(requestParams).then(null,
      error => expect(error).toMatchSnapshot());
  });

  test('Throws 404 if null returned', () => {
    requestParams.models = buildModels(new MockModel({ type: 'my-type' }));

    expect.assertions(1);
    return get(requestParams).then(null,
      error => expect(error).toMatchSnapshot());
  });

  test('Creates response document on success', () => {
    requestParams.models = buildModels(new MockModel({ type: 'my-type' }, [{ id: '1' }]));

    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Throws on invalid include', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: { type: 'other-type', array: true }
        }
      }, [{ id: '1' }]),
      new MockModel({ type: 'other-type' })
    );
    requestParams.includes = { rel1: { rel2: {} } };
    expect.assertions(1);
    return get(requestParams).then(null, error => expect(error).toMatchSnapshot());
  });

  test('Includes related resource', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: {  type: 'other-type' }
        }
      }, [{ id: '1', rel1: '1' }]),
      new MockModel({ type: 'other-type' }, [{ id: '1' }])
    );
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes related resources', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: { type: 'other-type', array: true }
        }
      }, [{ id: '1', rel1: ['1', '2', '3'] }]),
      new MockModel({ type: 'other-type' }, [{ id: '1' }, { id: '2' }, { id: '3' }])
    );
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Sets null relationship data', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: {  type: 'other-type' }
        }
      }, [{ id: '1', rel1: null }]),
      new MockModel({ type: 'other-type' })
    );
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes attributes', () => {
    requestParams.models = buildModels(new MockModel({ type: 'my-type' }, [{
      id: '1',
      attr: '1',
      field: ['2', '3'],
      foo: { bar: new Date(1234567890123) }
    }]));
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });
});

describe('Test getting all resources', () => {
  let requestParams: IGetAllRequestParams;

  beforeEach(() => {
    const models = {};
    requestParams = {
      method: 'get',
      type: 'my-type',
      fields: null,
      includes: null,
      page: null,
      filters: null,
      sorts: null,
      options: { models },
      models,
      baseUrl: ''
    };
  });

  test('Throws if model not found', () => {
    expect.assertions(1);
    return get(requestParams).then(null,
      error => expect(error).toMatchSnapshot());
  });

  test('Returns body with empty data array if no items found', () => {
    requestParams.models = buildModels(new MockModel({ type: 'my-type' }));

    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Returns body with all items found', () => {
    requestParams.models = buildModels(new MockModel({
      type: 'my-type'
    }, [1, 2, 3, 4, 5].map(n => ({ id: String(n) }))));

    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes related resource', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: { type: 'other-type' }
        }
      }, [1, 2, 3, 4, 5].map(n => ({ id: String(n), rel1: String(100 - n) }))),
      new MockModel({
        type: 'other-type'
      }, [99, 98, 97, 96, 95].map(n => ({ id: String(n) })))
    );
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes related resources', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: { type: 'other-type', array: true }
        }
      }, [1, 2, 3, 4, 5].map(n => ({
        id: String(n),
        rel1: [String(100 - 5 * n), String(100 - 5 * n), String(100 - 5 * n)]
      }))),
      new MockModel({
        type: 'other-type'
      }, Array.from(Array(100).keys()).map(n => ({ id: String(n + 1) })))
    );
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Sets null relationship data', () => {
    requestParams.models = buildModels(
      new MockModel({
        type: 'my-type',
        relationships: {
          rel1: { type: 'other-type' }
        }
      }, [1, 2, 3, 4, 5].map(n => ({ id: String(n), rel1: null }))),
      new MockModel({ type: 'other-type' })
    );
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes attributes', () => {
    requestParams.models = buildModels(
      new MockModel({ type: 'my-type' }, [1, 2, 3, 4, 5].map(n => ({
        id: String(n),
        attr: '1',
        field: ['2', '3'],
        foo: { bar: new Date(1234567890123) }
      })))
    );
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });
});
