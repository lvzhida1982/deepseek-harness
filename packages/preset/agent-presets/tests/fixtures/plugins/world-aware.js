// Fixture preset row that can only activate when mounted below an execution
// world providing the isolated `worldMarker` service.
export const name = 'world-aware'
export const inject = ['tools', 'worldMarker']

export function apply(ctx) {
  const label = ctx.worldMarker.label
  ctx.effect(() => ctx.tools.register({
    name: `world-${label}`,
    description: `fixture tool for execution world ${label}`,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: () => Promise.resolve(label),
  }))
}
