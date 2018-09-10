import {
  IPostgresRelationshipSchema,
} from '../postgres-model';

export type FJoinGenerator = (parentTableAlias: string, childTableAlias: string) => string;

export interface IJoinRelationship extends IPostgresRelationshipSchema {
  junctions?: ReadonlyArray<{
    readonly table: string;
    readonly sqlJoin: FJoinGenerator;
  }>;
  sqlJoin: FJoinGenerator;
}

export type TPostgresRelationshipSchmea = IPostgresRelationshipSchema | IJoinRelationship;

export function isJoin(rel: TPostgresRelationshipSchmea): rel is IJoinRelationship {
  return 'sqlJoin' in rel;
}
