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

const itemId = '1';

describe('Test building an IResourceObject', () => {
  test('Let nulls pass through', () => {
    expect(dataToResource(schema, null)).toBeNull();
  });

  test('Convert `empty` IResrouceData to IResourceObject', () => {
    expect(dataToResource(schema, {
      id: itemId,
      type: schema.type
    })).toEqual({
      id: itemId,
      type: schema.type,
      links: { self: `/${schema.type}/${itemId}` }
    });
  });

  test('Add attributes', () => {
    const date = new Date();

    expect(dataToResource(schema, {
      id: itemId,
      type: schema.type,
      some: 'attribute',
      'a-date': date,
      'an-array-of-stuff': [1, '2', { n: '3' }]
    })).toEqual({
      id: itemId,
      type: schema.type,
      links: { self: `/${schema.type}/${itemId}` },
      attributes: {
        some: 'attribute',
        'a-date': date,
        'an-array-of-stuff': [1, '2', { n: '3' }]
      }
    });
  });

  test('Add relationships', () => {
    expect(dataToResource(schema, {
      id: itemId,
      type: schema.type,
      rel: '5',
      'other-rel': null
    })).toEqual({
      id: itemId,
      type: schema.type,
      links: { self: `/${schema.type}/${itemId}` },
      relationships: {
        rel: {
          data: {
            type: 'related-type',
            id: '5'
          },
          links: {
            self:  `/${schema.type}/${itemId}/relationships/rel`,
            related: `/${schema.type}/${itemId}/rel`
          }
        },
        'other-rel': {
          data: null,
          links: {
            self:  `/${schema.type}/${itemId}/relationships/other-rel`,
            related: `/${schema.type}/${itemId}/other-rel`
          }
        }
      }
    });
  });

  test('Use custom `links` generation', () => {
    expect(dataToResource({
      type: 'test-type',
      links({ id }: { id: string; }) {
        return { self: { href: `/v2/test-type/${id}`, meta: { version: 'v2' } } };
      }
    }, { id: itemId, type: schema.type })).toEqual({
      id: itemId,
      type: schema.type,
      links: { self: { href: `/v2/test-type/${itemId}`, meta: { version: 'v2' } } }
    });
  });
});
