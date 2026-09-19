/**
 * The API compiles with CommonJS module resolution, which does not read the
 * "exports" map of @electric-sql/pglite. Declare the subpath we use so the
 * embedded driver stays fully typed. (Runtime resolution works via Node ESM.)
 */
declare module '@electric-sql/pglite/contrib/pgcrypto' {
  export const pgcrypto: unknown;
}
