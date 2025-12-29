import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler';

export default {
  async fetch(request, env, ctx) {
    try {
      return await getAssetFromKV(
        {
          request,
          waitUntil(promise) {
            return ctx.waitUntil(promise);
          },
        },
        {
          mapRequestToAsset: req => new Request(`${new URL(req.url).origin}${req.url.pathname}`, req),
        }
      );
    } catch (e) {
      // If an asset is not found, return index.html for SPA routing
      let pathname = new URL(request.url).pathname;
      if (pathname !== '/index.html') {
        return await getAssetFromKV(
          {
            request: new Request(`${new URL(request.url).origin}/index.html`, request),
            waitUntil(promise) {
              return ctx.waitUntil(promise);
            },
          },
          {
            mapRequestToAsset: req => req,
          }
        );
      }
      return new Response('Asset not found', { status: 404 });
    }
  },
};
