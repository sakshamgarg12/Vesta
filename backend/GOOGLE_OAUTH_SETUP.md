# Google Sign-In for Vesta (one-time, ~10 minutes)

The storefront and admin dashboard use **Google Identity Services** (the “Sign in with Google” button). You only need a **Web client ID** from Google Cloud. A client **secret** is *not* required for the flow we use (ID token verification on the server).

## 1. Create or pick a project

1. Open [Google Cloud Console – Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a new project, or select an existing one (e.g. “Vesta”).

## 2. OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (fine for your own use and testers).
3. App name, support email, developer email: fill in anything sensible.
4. Scopes: default (`openid`, `email`, `profile`) is enough.
5. If the app is in **Testing** mode, add your Gmail under **Test users** so you can sign in before verification.

## 3. Create OAuth client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Name:** e.g. `Vesta Web`.
4. **Authorized JavaScript origins** (no path, no trailing slash issues):

   - Local: `http://localhost:5000`  
   - Production, when you deploy: `https://your-domain.com`

5. **Authorized redirect URIs** (Google often wants at least one; our flow uses the JS origin + ID token, but add anyway):

   - `http://localhost:5000`
   - `https://your-domain.com` when you go live

6. **Create** and copy the **Client ID** (looks like `xxxxx.apps.googleusercontent.com`).

## 4. Put values in `backend/.env`

```env
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
SESSION_SECRET=any_long_random_string_at_least_32_chars
ADMIN_EMAILS=vesta.admin@gmail.com
```

- **`SESSION_SECRET`:** sign a random 48-byte hex, e.g. run  
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- **`ADMIN_EMAILS`:** comma-separated list of **exact** admin Gmail addresses.  
  **Each address must include the word `admin`** in the local part (e.g. `vesta.admin@gmail.com`), and must match the Google account you use to sign in.

## 5. Database migration (if not already run)

```bash
cd backend
npm run migrate-auth
```

Restart the server after changing `.env`.

## 6. Quick checks

- `GET http://localhost:5000/api/auth/config` → `{ "configured": true, "client_id": "..." }`
- Open `http://localhost:5000/login.html` → Google button appears; after sign-in, you stay on a session cookie and can use checkout, track, and (if allow-listed) `admin.html`.

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| “Google Sign-In is not configured” | `GOOGLE_CLIENT_ID` empty or server not restarted |
| `400 redirect_uri` / origin errors | Add exact origin `http://localhost:5000` (scheme + port) under **JavaScript origins** |
| `403` on admin | Email not in `ADMIN_EMAILS` or does not contain `admin` |
| `audience` / invalid token | Client ID in `.env` does not match the one in the web app you’re loading |

For production, add your real HTTPS origin to both the OAuth client and `CORS_ORIGIN` in `.env` if the API and site are on different hosts.
