const regexpCache = new Map<string, RegExp>();

export default function aliasTableInQuery(sql: string, table: string, alias: string): string {
  if (table === alias) {
    return sql;
  }
  let exp = regexpCache.get(table);
  if (!exp) {
    if (table.startsWith('"')) {
      exp = new RegExp(`(^|[^"])${table}\\.`, 'g');
    } else {
      exp = new RegExp(`(^|[^\\w_$])${table}\\.`, 'g');
    }
    regexpCache.set(table, exp);
  }
  return sql.replace(exp, alias + '.');
}

export function aliasTableInQueries(sql: string[], table: string, alias: string): string[] {
  if (table !== alias) {
    for (let i = 0; i < sql.length; ++i) {
      sql[i] = aliasTableInQuery(sql[i], table, alias);
    }
  }
  return sql;
}
