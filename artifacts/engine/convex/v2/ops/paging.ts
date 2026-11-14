/** An affordance's `{cursor, limit}` as Convex pagination options. */
export const pageOf = (a: { cursor?: string | null; limit: number }) => ({ cursor: a.cursor ?? null, numItems: a.limit });
