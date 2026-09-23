# AK Branch Monitor

A bilingual dashboard for monitoring 66 Google Business locations. It displays profile status, aggregate ratings, review counts, refresh health, reviewer details returned by the approved API, and per-branch filtering.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm start
```

Open <http://127.0.0.1:4387/>.

## Production deployment

The intended production URL is <https://braches.stcdigitalhub.com/>. Configure these environment variables on the Node.js host:

```text
PUBLIC_ORIGIN=https://braches.stcdigitalhub.com
APP_USERNAME=<dashboard username>
APP_PASSWORD_SHA256=<sha256 of the dashboard password>
SESSION_SECRET=<random high-entropy session signing key>
```

The host supplies `PORT`; the server listens on that port automatically. For production OAuth, add `https://braches.stcdigitalhub.com/oauth/callback` to the Google OAuth client's authorized redirect URIs.

## Data refresh

The current refresh path reads public Google Maps listing aggregates and retains the last saved values when Google blocks or cannot confidently match a branch. The dashboard clearly reports successful, failed, and partial refreshes.

Full review bodies require approved Google Business Profile API access. Configure the OAuth client locally in `.private/google-client.json`; tokens and credentials are intentionally excluded from Git.

## Validation

```powershell
npm test
```

The test suite covers login sessions, the 66-branch registry, review pagination, partial refresh retention, public listing parsing, dashboard metrics, and ambiguous match handling.
