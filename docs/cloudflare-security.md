# Cloudflare Security Config

Manual steps to configure in the Cloudflare Dashboard for MENA Intel Desk.

---

## CVE-2025-29927 Mitigation (CRITICAL — do this immediately)

This is the belt-and-suspenders defense at CDN level. The app already uses Next.js 15.2.3+ (code-level fix); this adds CDN-level protection.

1. **Cloudflare Dashboard** → **Security** → **WAF** → **Transform Rules** → **HTTP Request Header Modification**
2. **Create rule**
   - **Rule name:** `Strip CVE-2025-29927 Header`
   - **Action:** Remove request header
   - **Header name:** `x-middleware-subrequest`
   - **Apply to:** All incoming requests (match all traffic)

This prevents anyone from injecting this header from outside Cloudflare.

---

## Rate Limiting Rules

**Cloudflare Dashboard** → **Security** → **WAF** → **Rate Limiting Rules**

### Rule 1: API endpoints

- **Name:** `API Rate Limit`
- **Path:** `/functions/v1/api-*`
- **Rate:** 100 requests per minute per IP
- **Action:** Block for 1 minute

### Rule 2: Admin endpoints

- **Name:** `Admin Rate Limit`
- **Path:** `/functions/v1/admin-*`
- **Rate:** 30 requests per minute per IP
- **Action:** Block for 5 minutes

### Rule 3: Login endpoint

- **Name:** `Login Rate Limit`
- **Path:** `/login`
- **Rate:** 10 requests per minute per IP
- **Action:** Block for 10 minutes (brute force protection)

---

## Email Protection

**Cloudflare Dashboard** → **Scrape Shield** → **Email Address Obfuscation** → **OFF**

**Reason:** Email obfuscation can interfere with legitimate `mailto:` links and causes 404 crawl errors in Google Search Console.
