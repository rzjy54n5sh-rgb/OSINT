# Supabase Auth setup (MENA Intel Desk)

## Site URL

- **Production:** `https://mena-intel-desk.pages.dev` (or your custom domain)
- **Local:** `http://localhost:3000`

Set in Supabase Dashboard: **Authentication → URL Configuration → Site URL.**

## Redirect URLs

Add these under **Authentication → URL Configuration → Redirect URLs**:

- `https://mena-intel-desk.pages.dev/**`
- `http://localhost:3000/**`

Use your custom domain in place of `mena-intel-desk.pages.dev` if applicable.

## OAuth providers (optional)

To enable social sign-in, configure in **Authentication → Providers**:

- **Google** — Create OAuth client in Google Cloud Console, add Client ID and Secret.
- **GitHub** — Create OAuth App in GitHub Settings → Developer settings, add Client ID and Secret.
- **Apple** — Configure in Apple Developer, add Service ID and keys.
- **Microsoft** — Register app in Azure AD, add Application (client) ID and Secret.
- **Samsung** — Use Samsung Developers, add Client ID and Secret if needed.

After adding credentials, ensure the redirect URL shown in Supabase is whitelisted in each provider’s console.
