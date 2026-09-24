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
AK_DATA_DIR=<persistent private directory outside the deployed release>
```

The host supplies `PORT`; the server listens on that port automatically. For production OAuth, add `https://braches.stcdigitalhub.com/oauth/callback` to the Google OAuth client's authorized redirect URIs.

## User management and access control

The account configured by `APP_USERNAME` is bootstrapped as both **Super Admin** and **Admin** with access to every screen and protected action. For the current installation this is `arjun.sajimon`.

Super Admins can create and manage users from **User management**, assign roles, activate or deactivate accounts, reset passwords, and grant access independently to Overview, Branches, Ratings & reviews, Data source, User management, refresh, Google connection, and user administration. Permissions are checked by the Node server on every protected API request; the browser navigation is only a matching presentation layer.

User records are stored in `users.json` under `AK_DATA_DIR` (or `.private` locally). New passwords use salted `scrypt` hashes and are never returned by the API. Point `AK_DATA_DIR` to persistent private storage in production so users survive deployments. The server prevents self-deactivation, self-removal of Super Admin access, and removal of the final active Super Admin.

## Data refresh

The current refresh path reads public Google Maps listing aggregates and retains the last saved values when Google blocks or cannot confidently match a branch. The dashboard clearly reports successful, failed, and partial refreshes.

Full review bodies require approved Google Business Profile API access. Configure the OAuth client locally in `.private/google-client.json`; tokens and credentials are intentionally excluded from Git.

## Validation

```powershell
npm test
```

The test suite covers login sessions, the 66-branch registry, review pagination, partial refresh retention, public listing parsing, dashboard metrics, and ambiguous match handling.
