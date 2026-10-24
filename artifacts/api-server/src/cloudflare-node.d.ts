declare module "cloudflare:node" {
  export function httpServerHandler(input: { port: number }): {
    fetch(request: Request): Promise<Response>;
  };
}
