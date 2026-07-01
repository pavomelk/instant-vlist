# books-list Cloudflare Pages deploy

This folder is ready to deploy as a static Cloudflare Pages project.

## What's included

- `index.html` and `instant-vlist.js`
- `books.ndjson` sample stream data (local fallback/example)
- `wrangler.toml` Pages config
- `.wranglerignore` to exclude `.vscode` and local/tooling folders from upload

## Deploy to your existing Cloudflare account

1. Authenticate Wrangler:

   ```bash
   npx wrangler login
   ```

2. Create the Pages project once (skip if it already exists):

   ```bash
   npx wrangler pages project create books-list --production-branch main
   ```

3. Deploy this folder:

   ```bash
   npx wrangler pages deploy . --project-name books-list
   ```

## Stream source in deployed app

By default, the app loads from:

https://books-stream.pavomelk.workers.dev/?num_records=1000

Change record count with:

https://<your-pages-domain>/?num_records=2500

## Use a different NDJSON endpoint

You can override the source completely with `stream`:

To stream from another endpoint, add `stream` in the URL:

```text
https://<your-pages-domain>/?stream=https://example.com/books.ndjson
```
