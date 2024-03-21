// To fix the following error:
// SyntaxError: Indirectly exported binding name 'ConnectOpts' is not found.

export * from "./api/client.gen.js"
export * from "./common/errors/index.js"
export { gql } from "graphql-tag"
export { GraphQLClient } from "graphql-request"
export { connect, connection, close } from "./connect.js"
export type { CallbackFct } from "./connect.js"
export type { ConnectOpts } from "./connectOpts.js"
export * from "./introspector/decorators/decorators.js"
export { entrypoint } from "./entrypoint/entrypoint.js"
