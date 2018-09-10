import { IJSONObject } from 'jsonapi-types';
import { IJoinDef, IModelFilter } from '../postgres-model';

export default function applyFilterOptions({
  leftJoins,
  innerJoins,
  conditions,
  params,
  filterOptions
}: {
  leftJoins: IJoinDef[];
  innerJoins: IJoinDef[];
  conditions: string[];
  params: IJSONObject;
  filterOptions?: IModelFilter | null;
}): {
  innerJoins: IJoinDef[];
  leftJoins: IJoinDef[];
} {

  if (!filterOptions) {
    return { innerJoins, leftJoins };
  }

  if (filterOptions.innerJoins) {
    innerJoins = innerJoins.concat(
      filterOptions.innerJoins.filter(
        joinA => innerJoins.every(
          joinB => joinA.table !== joinB.table
        )
      )
    );
  }

  if (filterOptions.leftJoins) {
    leftJoins = leftJoins.concat(
      filterOptions.leftJoins.filter(
        joinA => leftJoins.every(
          joinB => joinA.table !== joinB.table
        )
      )
    );
  }

  if (filterOptions.params) {
    Object.assign(params, filterOptions.params);
  }

  if (filterOptions.conditions) {
    conditions.push.apply(conditions, filterOptions.conditions);
  }

  return { innerJoins, leftJoins };
}
