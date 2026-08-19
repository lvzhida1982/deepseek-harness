export const name = 'shell-dialect-tool'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const toolName = config.name ?? 'shell-dialect'
  ctx.effect(() => ctx.tools.register({
    name: toolName,
    description: `fixture tool selected for ${toolName}`,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: () => Promise.resolve(toolName),
  }))
}
