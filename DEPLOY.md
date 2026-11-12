# Deploying BlogSpace to Vercel

## Step 1 — Create a free Turso database

Turso is a hosted SQLite service. Free tier gives you 500 databases.

1. Go to **https://turso.tech** and sign up (free)
2. Install the Turso CLI:
   ```
   winget install turso
   ```
   Or use the web dashboard instead — no CLI needed.

3. Create a database:
   ```
   turso db create blogspace
   ```

4. Get your database URL:
   ```
   turso db show blogspace
   ```
   Copy the **URL** (looks like `libsql://blogspace-username.turso.io`)

5. Create an auth token:
   ```
   turso db tokens create blogspace
   ```
   Copy the token.

---

## Step 2 — Push to GitHub

1. Create a new repo on **https://github.com/new**
2. In the `Blog Platform` folder, run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/blog-platform.git
   git push -u origin main
   ```

---

## Step 3 — Deploy to Vercel

1. Go to **https://vercel.com** and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `blog-platform` repository
4. Set the **Root Directory** to: `. ` (leave as default — the repo root)
5. Under **Environment Variables**, add:

   | Name | Value |
   |------|-------|
   | `TURSO_DATABASE_URL` | `libsql://blogspace-username.turso.io` |
   | `TURSO_AUTH_TOKEN` | `your_turso_auth_token` |
   | `JWT_SECRET` | any long random string e.g. `blogspace_prod_secret_2026_xyz` |

6. Click **Deploy** ✓

Your app will be live at `https://blog-platform-username.vercel.app`

---

## Step 4 — Verify

Visit your Vercel URL and:
- Register an account
- Create a post
- Leave a comment

The database tables are created automatically on first request.

---

## Local development (still works!)

The old backend still works locally:
```
cd backend
npm start
```
Opens at http://localhost:5000

The frontend `api.js` now uses relative `/api` URLs, so it works on both
localhost (via the Express server) and Vercel (via serverless functions).
