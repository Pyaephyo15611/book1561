export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Try to serve the requested asset first
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      // If asset not found, serve index.html for SPA routing
      return await env.ASSETS.fetch(
        new Request(`${url.origin}/index.html`, request)
      );
    }
  }
};

