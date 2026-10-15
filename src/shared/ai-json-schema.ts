// Structured Outputs represents absent optional values as required nullable fields.
type JsonSchema = Record<string, any>;
export function strictOutputSchema(schema: JsonSchema): JsonSchema {
  const visit = (value: any): any => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    const result: JsonSchema = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item)]),
    );
    if (value.type === 'object') {
      const required = new Set(value.required || []);
      for (const name of Object.keys(result.properties || {})) {
        if (!required.has(name))
          result.properties[name] = { anyOf: [result.properties[name], { type: 'null' }] };
      }
      result.required = Object.keys(result.properties || {});
      result.additionalProperties = false;
    }
    return result;
  };
  return visit(schema);
}
// Only AI wire values use null for absence. Local JSON validation stays unchanged.
export function normalizeOptionalNulls(value: unknown, schema: JsonSchema): unknown {
  if (schema.anyOf) {
    const branch =
      schema.anyOf.find((item: JsonSchema) => {
        const kind = item.properties?.kind;
        return (
          kind &&
          value &&
          typeof value === 'object' &&
          ('const' in kind
            ? kind.const === (value as any).kind
            : kind.enum?.includes((value as any).kind))
        );
      }) || schema.anyOf.find((item: JsonSchema) => item.type !== 'null');
    return branch ? normalizeOptionalNulls(value, branch) : value;
  }
  if (Array.isArray(value))
    return schema.items ? value.map((item) => normalizeOptionalNulls(item, schema.items)) : value;
  if (!value || typeof value !== 'object' || !schema.properties) return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const property = Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
      if (property && item === null && !(schema.required || []).includes(key)) return [];
      return [[key, property ? normalizeOptionalNulls(item, property) : item]];
    }),
  );
}
