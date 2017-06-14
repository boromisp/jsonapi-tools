import 'jest';
import dataToLinkage from '../data-to-linkage';

describe('Test converting to-one relationships', () => {
  test('Convert string ID to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, '5', 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Convert number ID to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, 5, 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Convert number ILinkage to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, { id: '5' }, 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Convert null to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, null, 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Pass through ILinkage.meta', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, { id: '5', meta: { not: 'standard' } }, 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Use custom links generator', () => {
    expect(
      dataToLinkage({
        type: 'related-type',
        links: (parent, id, relationship) => ({
          self: `/${parent}/${id}/rels/${relationship}`
        })
      }, '5', 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });
});

describe('Test converting to-many relationships', () => {
  test('Convert string ID to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, ['1', '2', '3'], 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Convert number ID to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, [1, 2, 3], 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });

  test('Convert number ILinkage to IRelationshipObject', () => {
    expect(
      dataToLinkage({ type: 'related-type' }, [{ id: '1'}, { id: '2' }, { id: '3' }], 'test-type', '1', 'rel')
    ).toMatchSnapshot();
  });
});
