'use strict';

import { IRelationshipSchema, ILinkage, ILinkageData, isDataLinkage } from '../../../types/model';
import { IResourceIdentifierObject, IRelationshipObject } from 'jsonapi-types';

export type TypeID = string | number;

export type TypeLinkage = ILinkage | ILinkage[] | null;

export default function dataToLinkage(
  schema: IRelationshipSchema,
  data: TypeLinkage,
  parentType: string,
  parentId: TypeID,
  relationship: string): IRelationshipObject {

  function mapLinkage(item: ILinkage): IResourceIdentifierObject {
    const linkageData: ILinkageData = {
      type: schema.type,
      id: String(isDataLinkage(item) ? item.id : item)
    };

    if (isDataLinkage(item) && item.meta) {
      linkageData.meta = item.meta;
    }

    return linkageData;
  }

  return {
    data: Array.isArray(data) ? data.map(mapLinkage) : (data || data === 0) ? mapLinkage(data) : null,
    links: schema.links ? schema.links({ parentType, parentId, relationship }) : {
      self: `/${parentType}/${parentId}/relationships/${relationship}`,
      related: `/${parentType}/${parentId}/${relationship}`
    }
  };
}
