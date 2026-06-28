# Deployment runbook

How Makina ships to production: **S3 static website** → **Cloudflare proxy** → users. This is the path for `makina.thelawrence.site`. If you're forking and deploying elsewhere, the same shape applies; substitute your own domain/bucket.

---

## Topology

```
user ──HTTPS──► Cloudflare edge ──HTTP──► S3 website endpoint
                  │ (Transform Rules add security headers)
                  │ (Configuration Rule sets SSL=Flexible for makina.*)
                  └ Cache + free CDN
```

- The browser only ever talks to Cloudflare over HTTPS.
- Cloudflare talks to S3 over HTTP (S3 website endpoints don't speak HTTPS).
- The Cloudflare↔S3 hop is plain HTTP. Acceptable here because the site is public, static, and has no auth.

---

## One-time setup

### 1. S3 bucket

- **Bucket name**: must equal the public subdomain. For us: `makina.thelawrence.site`.
- **Region**: `us-east-1` (cheapest egress to Cloudflare's North American edges).
- **Block Public Access** → "Block *all* public access": **OFF**.
- **Bucket policy** (Permissions → Bucket policy):

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::makina.thelawrence.site/*"
    }]
  }
  ```
- **Static website hosting** (Properties → bottom): **enabled**. Index document `index.html`, **error document `index.html`** (this makes SPA-style URLs fall through correctly).

### 2. DNS via Cloudflare

- Domain on Cloudflare (free plan is fine). Nameservers pointed at Cloudflare at the registrar.
- **Important**: when migrating nameservers, manually re-add every DNS record Cloudflare's auto-scan missed (especially TXT records for email/SPF/DKIM/DMARC). Otherwise subdomains may break.
- DNS → Records → Add:

  | Type | Name    | Target                                                         | Proxy   |
  | ---- | ------- | -------------------------------------------------------------- | ------- |
  | CNAME| makina  | `makina.thelawrence.site.s3-website-us-east-1.amazonaws.com`    | Proxied (orange cloud) |

  Mail records (MX, mail server A) **must be gray cloud** — Cloudflare can't proxy SMTP.

### 3. SSL/TLS — per-subdomain override

The zone-level SSL mode should be **Full** or **Full (strict)** so other subdomains keep end-to-end encryption. The S3 subdomain alone is downgraded to **Flexible**:

1. Rules → **Configuration Rules** → Create.
2. **Name**: `S3 website Flexible SSL`.
3. **When**: Hostname `equals` `makina.thelawrence.site`.
4. **Then**: SSL → **Flexible**.
5. Deploy.

Free plan allows 10 Configuration Rules; this uses one.

### 4. Turn off Cloudflare's HTML injection

These features add scripts/handlers to your HTML that violate the app's strict CSP:

| Feature                          | Where                                                        | Action |
| -------------------------------- | ------------------------------------------------------------ | ------ |
| Web Analytics (`cloudflareinsights.com/beacon.min.js`) | Analytics & Logs → Web Analytics → Edit → Automatic Setup | OFF    |
| Browser Insights                 | Speed → Optimization                                         | OFF    |
| Email Address Obfuscation        | Scrape Shield                                                | OFF    |
| Rocket Loader                    | Speed → Optimization → Content Optimization                  | OFF    |

If you want analytics later, install a CSP-friendly option (Plausible, Umami) and update the meta CSP in `src/index.html`.

### 5. Security headers via Transform Rules

Rules → **Transform Rules** → **Modify Response Header** → Create:

- **Name**: `Security headers`
- **When**: Hostname equals `makina.thelawrence.site`
- **Then set**:

  ```
  Content-Security-Policy:
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src https://fonts.gstatic.com;
    img-src 'self' data:;
    connect-src 'self';
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self'
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  ```

  (Add `preload` to HSTS only after every subdomain is confirmed HTTPS — once preloaded, it's hard to undo.)

The meta CSP in `index.html` is a defense-in-depth copy of the script/style/font portions. The response-header version covers things `<meta>` can't, like `frame-ancestors` and HSTS.

### 6. AWS credentials

```bash
aws configure   # OR set AWS_PROFILE / AWS_REGION in your shell
```

You need `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on the bucket.

---

## Per-deploy

Three commands and a cache purge. The current [deploy.sh](../deploy.sh) assumes a sibling landing-page repo — skip it for app-only deploys.

```bash
# 1. Build with root base-href (no /app/ prefix when there's no landing page)
npm run build -- --base-href "/"

# 2. Sync hashed bundles (long cache, --delete removes old hashes)
aws s3 sync dist/automata-studio/browser/ s3://makina.thelawrence.site/ \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

# 3. Upload index.html with no-cache so users get fresh HTML
aws s3 cp dist/automata-studio/browser/index.html s3://makina.thelawrence.site/index.html \
  --cache-control "no-cache, must-revalidate" \
  --content-type "text/html; charset=utf-8"
```

### Cache purge

**Dashboard**: Caching → Configuration → **Purge Everything** (or Custom Purge with `https://makina.thelawrence.site/index.html`).

**API** (preferred for scripted deploys):

```bash
# One-time: create API token with Zone → Cache Purge → Edit, scoped to this zone only
export CF_ZONE_ID=...
export CF_API_TOKEN=...

curl -sX POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://makina.thelawrence.site/index.html"]}' >/dev/null
```

Hashed bundles never need purging — their URLs change every build.

---

## Verify

```bash
# Headers correct?
curl -I https://makina.thelawrence.site/
# Expect:
#   HTTP/2 200
#   content-security-policy: ...
#   strict-transport-security: ...
#   x-content-type-options: nosniff

# Fresh bundle?
curl -s https://makina.thelawrence.site/ | grep -oE 'main-[a-z0-9]+\.js'

# No Cloudflare injection?
curl -s https://makina.thelawrence.site/ | grep -oE 'cloudflareinsights|__cf_email__|rocket-loader'
# Expect: nothing
```

Then load the app in a fresh browser session (`Cmd+Shift+R` or Incognito), open DevTools, look for **zero** CSP violations in the console.

---

## Troubleshooting

### `HTTP/2 525` or `526` from the edge

Cloudflare is trying HTTPS to S3 and S3 doesn't speak HTTPS. The Configuration Rule (step 3) isn't applying. Verify the hostname filter matches `makina.thelawrence.site` exactly.

### `HTTP/2 403` with `x-amz-error-code: AccessDenied`

S3 is refusing the request directly. In order:

1. Did the deploy succeed? `aws s3 ls s3://makina.thelawrence.site/` should show files.
2. Is "Block all public access" off? (Permissions → Block public access)
3. Is the bucket policy present and exact? (above)
4. Is static website hosting enabled? Without it the CNAME resolves to a bucket-listing endpoint instead.

### CSP errors in the browser console

If you see violations for `cloudflareinsights.com` or "inline event handler" — Cloudflare's HTML injection is back on. Re-verify the four toggles in **One-time setup → 4**.

If they're for your own scripts/fonts — adjust the response-header CSP (Transform Rules) and the meta CSP in `src/index.html` together. They should match.

### Toggle / persistence changes don't appear live

The deployed JS bundle is cached. Order of operations:

1. `npm run build` — verify the new code is in the output (`grep readInitialTheme dist/.../*.js`).
2. `aws s3 sync … --delete` — the `--delete` removes the old hashed bundle.
3. `curl https://makina.thelawrence.site/ | grep main-` — confirm the served index.html points at the new hash.
4. **Hard refresh** (`Cmd+Shift+R`) or open in Incognito.

### Subdomain unreachable after nameserver migration

Cloudflare didn't auto-import that record. DNS → Records → add it manually. Mail records (MX, mail server A): gray cloud, not orange.

### `npm test` doesn't run any tests

The repo currently has a mix of Karma-style (`app.spec.ts`) and Vitest (`algorithms.spec.ts`). `ng test` uses `@angular/build:unit-test` which expects Vitest. To run only the Vitest specs:

```bash
npx vitest run
```

---

## Rolling back

S3 keeps no version history unless you enable bucket versioning. If you need a rollback:

1. Re-run `npm run build` from a known-good git commit.
2. Re-deploy with the same `aws s3 sync` commands.
3. Purge Cloudflare cache.

For faster recovery in the future, enable **S3 bucket versioning** before your next deploy — then a "rollback" becomes "restore the previous object version" in the AWS console.

---

## Cost

At low traffic (< a few thousand visits/month) the entire stack costs roughly:

- **S3 storage**: cents per month (build is ~500KB total).
- **S3 GET requests**: free tier covers it; otherwise ~$0.0004 per 1000.
- **Cloudflare free plan**: $0.

Cloudflare caches aggressively, so most page loads never touch S3.
