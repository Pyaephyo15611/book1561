addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const pathname = url.pathname
  
  // Handle static assets
  const staticAssetExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot']
  const isStaticAsset = staticAssetExtensions.some(ext => pathname.endsWith(ext))
  
  if (isStaticAsset) {
    // Try to fetch from assets
    const assetUrl = new URL(pathname, url.origin)
    return fetch(new Request(assetUrl, request))
  }
  
  if (pathname === '/') {
    // Serve index.html for root
    return fetch(new Request(new URL('/index.html', url.origin), request))
  }
  
  // For all other routes, serve index.html to let React Router handle it
  return fetch(new Request(new URL('/index.html', url.origin), request))
}
