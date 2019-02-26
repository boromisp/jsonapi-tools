import 'jest';
import dataToResource from '../data-to-resource';

const schema = {
  type: 'test-type',
  relationships: {
    rel: {
      type: 'related-type'
    },
    'other-rel': {
      type: 'related-type'
    }
  }
};

const schemaWithCustomLinks = {
  type: 'test-type',
  links(id?: string) {
    return {
      self: {
        href: `/v2/test-type/${id}`,
        meta: {
          version: 'v2'
        }
      }
    };
  }
};

describe('Test building an IResourceObject', () => {

  test('Convert `empty` IResrouceData to IResourceObject', () => {
    expect(dataToResource(schema, { id: '1' }, '')).toMatchSnapshot();
  });

  test('Add attributes', () => {
    expect(dataToResource(schema, {
      id: '1',
      some: 'attribute',
      'a-date': new Date(1234567890123),
      'an-array-of-stuff': [1, '2', { n: '3' }]
    }, '')).toMatchSnapshot();
  });

  test('Add relationships', () => {
    expect(dataToResource(schema, {
      id: '1',
      rel: '5',
      'other-rel': null
    }, '')).toMatchSnapshot();
  });

  test('Use custom `links` generation', () => {
    expect(dataToResource(schemaWithCustomLinks, { id: '1' }, '')).toMatchSnapshot();
  });
});
