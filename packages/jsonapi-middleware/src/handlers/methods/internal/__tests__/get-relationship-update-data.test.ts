import 'jest';

import getData from '../get-relationship-update-data';

describe('Test building an IResourceIdentifierObject[]', () => {
  test('Process empty body', () => {
    expect(getData('my-type', { data: [] }, true)).toHaveLength(0);
  });

  test('Throw on empty body', () => {
    expect(() => getData('my-type', { data: [] })).toThrow('Malformed request body.');
  });

  test('Throw on type mismatch', () => {
    expect(() => getData('my-type', { data: [{ type: 'other-type', id: '5' }] })).toThrow('Malformed request body.');
  });

  test('Pass through data with matching type', () => {
    const data = [{ type: 'my-type', id: '5' }];
    expect(getData('my-type', { data })).toBe(data);
  });
});
