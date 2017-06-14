'use strict';

import handleRequest, { TypeRequestParams } from '../../handlers/handle-request';
import { isRelatedRequest } from '../../handlers/methods/get';

import denormalize, { IDenormalizedResource } from 'denormalize-jsonapi';

import { IParsedIncludes } from '../../types/utils';

function flattenIncludes(includes: IParsedIncludes): string[][] {
  const rtv = [];
  for (const relationship of Object.keys(includes)) {
    const subIncludes = flattenIncludes(includes[relationship]);
    if (subIncludes.length) {
      for (const path of subIncludes) {
        path.unshift(relationship);
        rtv.push(path);
      }
    } else {
      rtv.push([relationship]);
    }
  }
  return rtv;
}

export default function localAdatpter(
  params: TypeRequestParams
): PromiseLike<IDenormalizedResource | IDenormalizedResource[] | null> {
  return handleRequest(params).then(response => {
    let includes;
    if (params.method === 'get' && (!isRelatedRequest(params) || !params.asLink) && params.includes) {
      includes = flattenIncludes(params.includes);
    }
    const doc = denormalize(response.body || null, includes);
    return doc ? doc.data : null;
  });
}
