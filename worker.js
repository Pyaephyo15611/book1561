export default {
  async fetch(request, env, ctx) {
    // Just pass through the request to the assets
    // Cloudflare Workers will automatically serve the correct files
    return fetch(request)
  }
}
