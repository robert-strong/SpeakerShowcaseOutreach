# Showcase Desk

Outreach CRM for getting Speak About AI speakers into showcases, education sessions and keynotes. It tracks the action plan, target organizations, contacts, outreach and an opportunity pipeline.

A static front end (`index.html`, `app.js`) plus three Vercel Functions in `api/`, with data stored in Upstash Redis. No build step.

## Deploy

1. Create an empty GitHub repository, then push this folder:

   ```bash
   git init
   git add .
   git commit -m "Showcase Desk"
   git branch -M main
   git remote add origin https://github.com/<you>/showcase-desk.git
   git push -u origin main
   ```

2. In Vercel, choose **Add New → Project**, import the repository, and deploy with the default settings (framework preset **Other**, no build command).

3. In the project, open **Storage**, add **Upstash for Redis** (the free plan is plenty) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

4. In **Settings → Environment Variables**, add `APP_PASSCODE` with a passcode you'll share with your team.

5. Redeploy (**Deployments → ⋯ → Redeploy**) so the new variables take effect.

The first time the site loads it fills the database with the 79-organization list and 24-task action plan from `seed.js`.

## Move your data over from the Claude artifact

1. In the artifact, open **Pipeline** and click **Back up everything**.
2. On the Vercel site, open **Pipeline**, click **Restore from backup** and choose that file.

Restoring replaces everything on the site with the backup.

## How it works

- Without a database connected, the site still runs but saves to the current browser only, and shows a notice saying so.
- The page refreshes data every 30 seconds and when you return to the tab, so teammates' changes appear without reloading.
- Edits save immediately. If two people edit the same record at once, the last save wins.
- `APP_PASSCODE` protects the data API. The page itself (and the public starter list in `seed.js`) loads without it. For extra protection, turn on Vercel's Deployment Protection.

## Run locally

```bash
npm install
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```
