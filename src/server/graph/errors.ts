// Errors raised by the graph-native services; the API maps them to 404 / 403 / 422.
export class GraphNotFoundError extends Error {
  readonly status = 404;
}
export class GraphForbiddenError extends Error {
  readonly status = 403;
}
export class GraphValidationError extends Error {
  readonly status = 422;
}

export type GraphActor = { userId: number; isCurator: boolean; isAdmin: boolean };
