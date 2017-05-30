import 'jest';
import { IRelationshipObject } from 'jsonapi-types';
import dataToLinkage from '../data-to-linkage';

const schema = {
  type: 'test-type',
  relationships: {
    rel: {
      type: 'related-type'
    }
  }
};

const itemId = '5';
const rel = 'rel';
const relatedId = '1';

const expected: IRelationshipObject = {
  data: null,
  links: {
    self: `/${schema.type}/${itemId}/relationships/${rel}`,
    related: `/${schema.type}/${itemId}/${rel}`
  }
};

describe('Test converting to-one relationships', () => {
  beforeAll(() => {
    expected.data = {
      type: schema.relationships[rel].type,
      id: relatedId
    };
  });

  test('Convert string ID to IRelationshipObject', () => {
    expect(
      dataToLinkage(schema.relationships[rel], relatedId, schema.type, itemId, rel)
    ).toEqual(expected);
  });

  test('Convert number ID to IRelationshipObject', () => {
    expect(
      dataToLinkage(schema.relationships[rel], Number(relatedId), schema.type, itemId, rel)
    ).toEqual(expected);
  });

  test('Convert number ILinkage to IRelationshipObject', () => {
    expect(
      dataToLinkage(schema.relationships[rel], { id: relatedId }, schema.type, itemId, rel)
    ).toEqual(expected);
  });

  test('Convert null to IRelationshipObject', () => {
    expect(
      dataToLinkage(schema.relationships[rel], null, schema.type, itemId, rel)
    ).toEqual(Object.assign({}, expected, { data: null }));
  });

  test('Pass through ILinkage.meta', () => {
    const expectedData = Object.assign({}, expected.data, { meta: { not: 'standard' } });
    expect(
      dataToLinkage(schema.relationships[rel], {
        id: relatedId,
        meta: { not: 'standard' }
      }, schema.type, itemId, rel)
    ).toEqual(Object.assign({}, expected, { data: expectedData }));
  });

  test('Pass through ILinkage.meta', () => {
    expect(
      dataToLinkage({
        type: 'related-type',
        links({ parentType, parentId, relationship }: { parentType: string, parentId: string, relationship: string }) {
          return { self: `/${parentType}/${parentId}/rels/${relationship}` };
        }
      }, relatedId, schema.type, itemId, rel)
    ).toEqual(Object.assign({}, expected, { links: { self: `/${schema.type}/${itemId}/rels/${rel}` } }));
  });
});

describe('Test converting to-many relationships', () => {
  const relatedIDs = ['1', '2', '3', '4', '5'];
  beforeAll(() => {
    expected.data = relatedIDs.map(id => ({
      type: schema.relationships[rel].type,
      id
    }));
  });

  test('Convert string ID to IRelationshipObject', () => {
    expect(
      dataToLinkage(schema.relationships[rel], relatedIDs, schema.type, itemId, rel)
    ).toEqual(expected);
  });

  test('Convert number ID to IRelationshipObject', () => {
    expect(
      dataToLinkage(schema.relationships[rel], relatedIDs.map(Number), schema.type, itemId, rel)
    ).toEqual(expected);
  });

  test('Convert number ILinkage to IRelationshipObject', () => {
    expect(
      dataToLinkage(
        schema.relationships[rel], relatedIDs.map(id => ({ id })), schema.type, itemId, rel
      )
    ).toEqual(expected);
  });
});
