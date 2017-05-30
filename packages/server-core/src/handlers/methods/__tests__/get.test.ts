import 'jest';

import get, { IGetOneRequestParams } from '../get';
import { ISuccessResponseObject } from '../../../types/utils';
import { IModel } from '../../../types/model';

function createModel(type: string): IModel {
  return {
    schema: { type },
    getOne() { return Promise.resolve(null); },
    getSome() { return Promise.resolve([]); },
    getAll() { return Promise.resolve([]); },
    update() { return Promise.resolve(null); },
    create() { return Promise.resolve({ id: '1' }); },
    delete() { return Promise.resolve(true); }
  };
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
    return (get(requestParams) as Promise<ISuccessResponseObject> )
      .catch(error => expect(error.message).toMatch('Model for type my-type could not be found.'));
  });

  test('Throws 404 if null returned', () => {
    requestParams.models['my-type'] = createModel('my-type');

    expect.assertions(1);
    return (get(requestParams) as Promise<ISuccessResponseObject> )
      .catch(error => expect(error.message).toMatch('Item of type my-type with id 1 not found.'));
  });

  test('Creates response document on success', () => {
    requestParams.models['my-type'] = createModel('my-type');
    requestParams.models['my-type'].getOne = ({ id }) => Promise.resolve({ id });

    expect.assertions(1);
    return (get(requestParams) as Promise<ISuccessResponseObject> )
      .then(doc => expect(doc.body!.data).toEqual({
        id: '1',
        type: 'my-type',
        links: { self: '/my-type/1' }
      }));
  });
});
