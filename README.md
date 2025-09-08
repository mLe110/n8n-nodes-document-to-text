# n8n-nodes-document-to-text

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials) <!-- delete if no auth needed -->  
[Compatibility](#compatibility)  
[Usage](#usage) <!-- delete if not using this section -->  
[Development](#development)  
[Publishing](#publishing)  
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. After publishing/installation, restart n8n so it picks up the node from your installed package.

## Operations

_List the operations supported by your node._
TODO ml update

## Credentials

_If users need to authenticate with the app/service, provide details here. You should include prerequisites (such as signing up with the service), available authentication methods, and how to set them up._

TODO ml update

## Compatibility

_State the minimum n8n version, as well as which versions you test against. You can also include any known version incompatibility issues._
TODO ml update

## Usage

_This is an optional section. Use it to help users with any difficult or confusing aspects of the node._

_By the time users are looking for community nodes, they probably already know n8n basics. But if you expect new users, you can link to the [Try it out](https://docs.n8n.io/try-it-out/) documentation to help them get started._

TODO ml update

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
