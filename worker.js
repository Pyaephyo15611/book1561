export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const pathname = url.pathname
    
    // Handle static assets (JS, CSS, images, etc.)
    const staticAssetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json']
    const isStaticAsset = staticAssetExtensions.some(ext => pathname.endsWith(ext))
    
    if (isStaticAsset) {
      // Try to fetch the static asset from the assets
      const assetRequest = new Request(url.pathname, request)
      return fetch(assetRequest)
    }
    
    // For all other routes (including root), serve index.html
    // This allows React Router to handle client-side routing
    const indexRequest = new Request('/index.html', {
      headers: request.headers,
      method: request.method
    })
    return fetch(indexRequest)
  }
}
