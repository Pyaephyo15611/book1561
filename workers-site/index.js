export default {
  async fetch(request, env, ctx) {
    // For Workers Sites, just pass the request through
    // Workers Sites will handle asset serving and SPA routing automatically
    return fetch(request);
  },
};
