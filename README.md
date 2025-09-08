# n8n-nodes-document-to-text

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. After publishing/installation, restart n8n so it picks up the node from your installed package.

## development

n8n doesn’t hot‑reload community nodes. To test locally:

1. Build the node

   ```bash
   npm run build
   ```

2. Link into n8n’s custom folder (one‑time)

   ```bash
   npm link // execute in the root of the repository
   mkdir -p ~/.n8n/custom
   cd ~/.n8n/custom
   npm link n8n-nodes-document-to-text
   ```

3. Start n8n locally (with debug logs enabled)

   ```bash
   N8N_LOG_LEVEL=debug N8N_LOG_PRETTY=true N8N_RUNNERS_ENABLED=true npx -y n8n
   ```

4. Develop
   - After code changes, run `npm run build` again.
   - Restart n8n to load the new build.

Notes

- If you change `package.json` entries (like the `n8n` registration), rebuild and restart n8n.
- If you use Docker, you can bind‑mount this package into `/home/node/.n8n/custom/node_modules/n8n-nodes-document-to-text/` and restart the container after builds.

## Publishing

Follow these steps to publish the package to npm:

1. Login to npm

   ```bash
   npm login
   ```

2. Verify metadata in `package.json`
   - `name`, `version`, `description`, `keywords` (include `n8n-community-node-package`), `repository`, `license`.
   - `files` includes `dist`, `README.md`, `LICENSE`.
   - `n8n` section correctly references built files in `dist/`.

3. Build and lint

   ```bash
   npm run prepublishOnly
   ```

4. Bump the version

   ```bash
   npm version patch   # or minor / major
   ```

5. Publish publicly

   ```bash
   npm publish --access public
   ```

6. Verify installation
   - Install into a clean environment or link into `~/.n8n/custom/`.
   - Restart n8n and confirm the node appears and works.

7. Release housekeeping (optional)
   - Tag the release in Git and create a GitHub release/changelog.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
