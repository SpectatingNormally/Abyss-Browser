# Abyss Brave Search — Supabase Edge Function

Abyss native in-app web results call the Supabase Edge Function using POST JSON (`{ q: query }`). Results are rendered inside an Abyss tab, and clicking a result routes it through Abyss navigation. The Brave API key remains server-side in the Supabase secret `BRAVE_API_KEY`.

## Configuration

- `brave-search-config.js` contains the Edge Function URL and the Supabase publishable key. Publishable keys are intended for browser use; never place a service-role or secret key in frontend files.
- The endpoint is set to `https://okhefqquavywsydomted.supabase.co/functions/v1/abyss-search`. If the function was deployed to a different Supabase project, change this URL to that project's function URL.
- Confirm the Edge Function CORS `Access-Control-Allow-Origin` matches the exact deployed Abyss website origin (origin only, no path), and allowed headers include `authorization, x-client-info, apikey, content-type`. CORS is not authentication.
- For static GitHub Pages, the function needs deliberate public/guest access if users search without signing in. If JWT verification is enabled, use the project's intended auth flow; don't disable authentication blindly. Public endpoints need rate/abuse protection.
- Keep the Brave API key in Supabase Edge Function secrets. Do not put it in this repo or the browser.

## Testing

1. Confirm the deployed function URL in `brave-search-config.js` matches your Supabase project.
2. Test the function in Supabase with POST body `{ "q": "Minecraft" }` and verify a `results` array is returned.
3. Deploy the site, open Abyss, search a phrase, and check that native result cards appear.
4. Click a result and verify it opens in an Abyss tab.

No SQL changes are required for this search integration.
