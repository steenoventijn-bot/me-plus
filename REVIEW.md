# Me+ world and reading update

This branch keeps the existing app, GitHub Pages address and Supabase account system. It replaces the broken raster world with a lazy-loaded Three.js scene, a persistent camera and an editable 3D house. The house, garden pond and dock become ordinary stored objects. Existing placed items retain their IDs and coordinates. The first placement implementation now commits precise coordinates and inventory consumption in one database transaction. Empty worlds are not seeded repeatedly.

Avatar refresh uses the full profile endpoint. Partial account responses merge into the current account; another account's response cannot replace it. All ten avatar choices remain supported. Hair layering and scalp coverage were checked in a rendered contact sheet. The homescreen icon is a simple Me+ wordmark; launch uses the same branding.

Every current article has one reviewed four-option question. The server records the first answer: correct awards one point, incorrect awards none. Concurrent or repeated submissions cannot award another point, and previously credited articles cannot earn duplicate knowledge points. Existing knowledge points are retained. Estimated reading time uses the actual displayed sections at 200 words/minute; the old 30-second floor and 180-second cap are removed. The displayed label and required session time use the same calculation. The current 16 articles range from 96–294 words, or approximately 29–89 seconds.

## Validation and release gate

- `npm test`: loader/account races, all avatar layers, empty-land placement, rotated footprints, model construction and house option changes, and reading/quiz data checks.
- `npm run build`: produces `dist/` with public assets only. Backend source, answer keys, tests and dependencies are excluded.
- The `Me+ checks` workflow uses an isolated PostgreSQL 17 service. It applies the proposed migration and tests stock rollback, ownership, empty layouts, reading eligibility, wrong answers, repeated answers and cross-session duplicate rewards.
- Local browser preview infrastructure was unavailable. The new WebGL scene has **not** passed a browser screenshot comparison, real-phone FPS testing, or an authenticated end-to-end round trip. Keep this PR a draft until those gates are complete. A successful JavaScript build alone is not proof of visual parity with the supplied reference.
- The old rarer object catalog is preserved. Some related reward objects currently share a base 3D model; individual asset art still needs visual review.

## Deployment order

Do not merge the Pages workflow before the backend is ready. First review/run the SQL checks and take the normal database backup. Apply `supabase/migrations/20260909060800_world_atomic_placement.sql`. Deploy the new `me-plus-world-v14-api` and `me-plus-knowledge-v14-api`, plus the updated legacy `me-plus-api`, `me-plus-v7-api` and `me-plus-social-api`. Preserve the custom device-token authentication and existing `verify_jwt=false`; every new endpoint validates the token hash before reading or writing account data. No anonymous table or RPC access is granted.

The existing `me-plus-world-api` and house-save endpoint remain in use. After an authenticated mobile/desktop review, merge this branch; GitHub Pages builds and deploys `dist`. Vercel is not involved.

Frontend changes can be reverted as one commit. Database rollback needs a deliberate migration: never delete players' new positions, answers or points simply to roll back visuals. Reverting to the legacy client also requires restoring the legacy completion endpoint if reverting the quiz flow.
