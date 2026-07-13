# Consuming sporeworks

sporeworks ships one artifact — `dist/grappleberry.js`, a single
self-contained ES module (worker source inlined) that registers
`<grappleberry-organism>` and exports the renderer API. Two ways to consume
it from a site, using qxtaiba.com as the worked example. In both cases the
site keeps serving the file from `public/grappleberry.js`, so nothing about
how the page loads it changes.

## Option A — npm dependency

Once the package is published to npm:

```jsonc
// site package.json
{
  "dependencies": {
    "sporeworks": "^0.1.0"
  },
  "scripts": {
    // copy the built artifact into public/ before every build/dev run
    "sync:grappleberry": "cp node_modules/sporeworks/dist/grappleberry.js public/grappleberry.js",
    "prebuild": "npm run sync:grappleberry",
    "predev": "npm run sync:grappleberry"
  }
}
```

Notes:

- The published package contains only `dist/` (plus README/LICENSE), already
  built — no postinstall build step on the consumer side.
- Version bumps are ordinary `npm update sporeworks` / lockfile changes; the
  artifact is reproducible from the tag that published it.
- `public/grappleberry.js` becomes a generated file in the site repo: add it
  to `.gitignore` (or keep committing it if the site prefers vendored,
  diff-reviewable artifacts — both work; pick one and document it).

## Option B — git dependency (no npm publish)

npm installs straight from a git URL. Git deps arrive unbuilt, so sporeworks
defines `"prepare": "npm run build"` — npm runs it (with devDependencies
available) when installing a git dependency, so `dist/grappleberry.js` exists
by the time the copy step runs. This is already in place; no sporeworks-side
change is needed. In the site:

```jsonc
// site package.json
{
  "dependencies": {
    "sporeworks": "github:qxtaiba/sporeworks#v0.1.0"
  },
  "scripts": {
    "sync:grappleberry": "cp node_modules/sporeworks/dist/grappleberry.js public/grappleberry.js",
    "prebuild": "npm run sync:grappleberry",
    "predev": "npm run sync:grappleberry"
  }
}
```

Notes:

- Pin to a tag (`#v0.1.0`) — never a branch — so installs are reproducible.
- The install builds locally, so the site's CI needs nothing beyond node
  (vite + typescript are sporeworks devDependencies and are installed for
  git deps when `prepare` exists).
- Slower installs than option A (a full vite build per fresh install).

## Alternative to the copy step (either option)

Instead of copying into `public/`, the site could import the module and let
its own bundler serve it:

```ts
import "sporeworks";
```

This inlines the engine into the site's own chunks. qxtaiba.com deliberately
does NOT do this — the engine is lazy-loaded as a separate static file to
keep the main bundle under its 100 KB gzip budget — but it is the simplest
path for sites without that constraint.

## Transition helper

While the site still builds the engine from a checkout, the build can target
the site's public dir directly:

```bash
npm run build -- --out /path/to/site/public/grappleberry.js
```
