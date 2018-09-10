import {
  IPostgresRelationshipSchema,
} from '../postgres-model';

export type FJoinGenerator = (parentTableAlias: string, childTableAlias: string) => string;

export interface IImmediateJoinRelationship extends IPostgresRelationshipSchema {
  sqlJoin: FJoinGenerator;
}

export interface IIndirectJoinRelationship extends IPostgresRelationshipSchema {
  junctionTable: string;
  sqlJoins: [FJoinGenerator, FJoinGenerator];
}

export type TPostgresRelationshipSchmea = (
  IPostgresRelationshipSchema | IImmediateJoinRelationship | IIndirectJoinRelationship
);

export function isImmediateJoin(rel: TPostgresRelationshipSchmea): rel is IImmediateJoinRelationship {
  return 'sqlJoin' in rel;
}

export function isIndirectJoin(rel: TPostgresRelationshipSchmea): rel is IIndirectJoinRelationship {
  return 'sqlJoins' in rel && 'junctionTable' in rel;
}
