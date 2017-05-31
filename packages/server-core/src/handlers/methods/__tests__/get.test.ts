import 'jest';

import get, { IGetOneRequestParams, IGetAllRequestParams } from '../get';
import { ISuccessResponseObject } from '../../../types/utils';
import { IModel, IModels, ISchema } from '../../../types/model';

import serializers from '../../../__test_utils__/custom-serializers';

for (const serializer of serializers) {
  expect.addSnapshotSerializer(serializer);
}

function mockModel(schema: IModel['schema'] | string, empty?: boolean): IModel {
  return {
    schema: typeof schema === 'string' ? { type: schema } : schema,
    getOne({ id }) {
      return Promise.resolve(empty ? null : { id });
    },
    getSome({ ids }) {
      return empty ? Promise.resolve([]) : Promise.all(ids.map(id => this.getOne({ id })));
    },
    getAll() {
      return this.getSome({ ids: ['1', '2', '3', '4', '5'] });
    },
    update() { return Promise.resolve(null); },
    create() { return Promise.resolve({ id: '1' }); },
    delete() { return Promise.resolve(true); }
  };
}

function buildModels(...args: IModel[]): IModels {
  return args.reduce((models, model) => {
    models[model.schema.type] = model;
    return models;
  }, {} as IModels);
}

describe('Test getting a single resource', () => {
  let requestParams: IGetOneRequestParams;

  beforeEach(() => {
    requestParams = {
      method: 'get',
      type: 'my-type',
      id: '1',
      fields: null,
      includes: null,
      page: null,
      options: {},
      models: {}
    };
  });

  test('Throws if model not found', () => {
    expect.assertions(1);
    return get(requestParams).then(null,
      error => expect(error).toMatchSnapshot());
  });

  test('Throws 404 if null returned', () => {
    requestParams.models = buildModels(mockModel('my-type', true));

    expect.assertions(1);
    return get(requestParams).then(null,
      error => expect(error).toMatchSnapshot());
  });

  test('Creates response document on success', () => {
    requestParams.models = buildModels(mockModel('my-type'));

    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Throws on invalid include', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: { rel2: {} } };
    expect.assertions(1);
    return get(requestParams).then(null, error => expect(error).toMatchSnapshot());
  });

  test('Includes related resource', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    model1.getOne = ({ id }) => Promise.resolve({ id, rel1: '1' });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes related resources', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    model1.getOne = ({ id }) => Promise.resolve({ id, rel1: ['1', '2', '3'] });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Sets null relationship data', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    model1.getOne = ({ id }) => Promise.resolve({ id, rel1: null });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes attributes', () => {
    const model = mockModel('my-type');
    model.getOne = ({ id }) => Promise.resolve({
      id,
      attr: '1',
      field: ['2', '3'],
      foo: { bar: new Date(1234567890123) }
    });
    requestParams.models = buildModels(model);
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });
});

describe('Test getting all resources', () => {
  let requestParams: IGetAllRequestParams;

  beforeEach(() => {
    requestParams = {
      method: 'get',
      type: 'my-type',
      fields: null,
      includes: null,
      page: null,
      filters: null,
      sorts: null,
      options: {},
      models: {}
    };
  });

  test('Throws if model not found', () => {
    expect.assertions(1);
    return get(requestParams).then(null,
      error => expect(error).toMatchSnapshot());
  });

  test('Returns body with empty data array if no items found', () => {
    requestParams.models = buildModels(mockModel('my-type', true));

    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Returns body with all items found', () => {
    requestParams.models = buildModels(mockModel('my-type'));

    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes related resource', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    model1.getOne = ({ id }) => Promise.resolve({ id, rel1: String(100 - Number(id)) });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes related resources', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    model1.getOne = ({ id }) => Promise.resolve({ id, rel1: [
      String(100 - Number(id) * 5),
      String(100 - Number(id) * 5),
      String(100 - Number(id) * 5)
    ] });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Sets null relationship data', () => {
    const model1 = mockModel({
      type: 'my-type',
      relationships: {
        rel1: {
          type: 'other-type'
        }
      }
    });
    model1.getOne = ({ id }) => Promise.resolve({ id, rel1: null });
    requestParams.models = buildModels(model1, mockModel('other-type'));
    requestParams.includes = { rel1: {} };
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });

  test('Includes attributes', () => {
    const model = mockModel('my-type');
    model.getOne = ({ id }) => Promise.resolve({
      id,
      attr: '1',
      field: ['2', '3'],
      foo: { bar: new Date(1234567890123) }
    });
    requestParams.models = buildModels(model);
    expect.assertions(1);
    return get(requestParams).then(doc => expect(doc).toMatchSnapshot());
  });
});
