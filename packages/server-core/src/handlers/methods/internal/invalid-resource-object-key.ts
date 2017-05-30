'use strict';

export default function invalidResourceObjectKey(key: string): boolean {
  return key !== 'type' && key !== 'id' && key !== 'attributes' && key !== 'relationships' && key !== 'meta';
}
