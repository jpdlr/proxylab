declare module "@fastify/static" {
  import type { FastifyPluginCallback } from "fastify";
  const plugin: FastifyPluginCallback<Record<string, unknown>>;
  export default plugin;
}
