'use strict';

process.env.NODE_ENV = 'test';

const chai = global.chai = require('chai');
chai.config.includeStack = true;
const assert = chai.assert;

const denormalize = require('../lib/index.js').default;

describe('denormalize', () => {
  it('should return null on null', () => {
    assert.equal(denormalize(null), null);
  });

  it('should return object with empty data on empty data', () => {
    assert.deepEqual(denormalize({ data: [] }), { data: [] });
  });

  it('should flatten resource attributes objects', () => {
    assert.deepEqual(denormalize({
      data: {
        id: '1',
        type: 'my-type',
        attributes: {
          first: 1,
          second: { key: 'value' },
          third: ['a', 'b', 'c'],
          fourth: null
        }
      }
    }), {
      data: {
        id: '1',
        type: 'my-type',
        first: 1,
        second: { key: 'value' },
        third: ['a', 'b', 'c'],
        fourth: null
      }
    });
  });

  it('should flatten resource relationship objects', () => {
    assert.deepEqual(denormalize({
      data: {
        id: '1',
        type: 'my-type',
        relationships: {
          first: { data: { type: 'other-type', id: '2' } },
          second: {
            data: [
              { type: 'my-type', id: '1' },
              { type: 'my-type', id: '2' },
              { type: 'my-type', id: '3' }
            ]
          },
          third: { data: null }
        }
      }
    }), {
      data: {
        id: '1',
        type: 'my-type',
        first: '2',
        second: ['1', '2', '3'],
        third: null
      }
    });
  });

  it('should resolve relationships if possible (self)', () => {
    const result = {
      data: {
        id: '1',
        type: 'my-type',
        first: '2',
        second: ['2', '3'],
        third: null
      }
    };

    result.data.second.unshift(result.data);

    assert.deepEqual(denormalize({
      data: {
        id: '1',
        type: 'my-type',
        relationships: {
          first: { data: { type: 'other-type', id: '2' } },
          second: {
            data: [
              { type: 'my-type', id: '1' },
              { type: 'my-type', id: '2' },
              { type: 'my-type', id: '3' }
            ]
          },
          third: { data: null }
        }
      }
    }, ['second']), result);
  });

  it('should resolve relationships if possible (included)', () => {
    const result = {
      data: {
        id: '1',
        type: 'my-type',
        first: {
          type: 'other-type',
          id: '2',
          key: 'value'
        },
        second: ['2', '3'],
        third: null
      }
    };

    result.data.second.unshift(result.data);

    assert.deepEqual(denormalize({
      data: {
        id: '1',
        type: 'my-type',
        relationships: {
          first: { data: { type: 'other-type', id: '2' } },
          second: {
            data: [
              { type: 'my-type', id: '1' },
              { type: 'my-type', id: '2' },
              { type: 'my-type', id: '3' }
            ]
          },
          third: { data: null }
        }
      },
      included: [{
        type: 'other-type',
        id: '2',
        attributes: {
          key: 'value'
        }
      }]
    }, ['first', 'second']), result);
  });

  it('should not resolve relationships if include is not specified', () => {
    const result = {
      data: {
        id: '1',
        type: 'my-type',
        first: '2',
        second: ['1', '2', '3'],
        third: null
      }
    };
    assert.deepEqual(denormalize({
      data: {
        id: '1',
        type: 'my-type',
        relationships: {
          first: { data: { type: 'other-type', id: '2' } },
          second: {
            data: [
              { type: 'my-type', id: '1' },
              { type: 'my-type', id: '2' },
              { type: 'my-type', id: '3' }
            ]
          },
          third: { data: null }
        }
      },
      included: [{
        type: 'other-type',
        id: '2',
        attributes: {
          key: 'value'
        }
      }]
    }, []), result);
  });

  it('should throw JSONAPI Error', () => {
    const result = {
      errors: [{
        status: 404,
        detail: 'Not found...'
      }]
    };

    assert.throws(() => denormalize(result), 'JSONAPI error');
  });

  it('should forward JSONAPI error data', (cb) => {
    const result = {
      errors: [{
        status: 404,
        detail: 'Not found...'
      }]
    };

    try {
      denormalize(result);
    } catch (error) {
      assert.deepEqual(error.data, result);
      cb();
    }
  });
});
