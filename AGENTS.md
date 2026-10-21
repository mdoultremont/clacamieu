# Clacamieu

This public repository contains the Clacamieu custom integration for Home Assistant. It must remain free of instance-specific configuration, credentials, device names, and inventory data.

## Product language

Read [`CONTEXT.md`](CONTEXT.md) when naming a feature, configuration family, device, or user-facing concept. Record a newly settled domain term there when it changes the glossary.

## Integration structure

- Keep one Home Assistant integration with the domain `clacamieu` under `custom_components/clacamieu`.
- Treat Energy, Lights, Dashboard, and Device Management as independent internal modules with a shared installation and release.
- Keep Home Assistant platform adapters at the integration root and place family-specific implementation behind small interfaces.
- Read [`docs/architecture.md`](docs/architecture.md) before changing Recorder calculations, statistics imports, Light Group+, the Maison panel, or config-entry ownership.
- Use public Home Assistant interfaces. Document and test any intentional dependency on an internal Home Assistant class.

## Language

- Write code, technical identifiers, docstrings, reference strings, and public documentation in English.
- Keep `translations/fr.json` complete for every user-facing string.
- Use Home Assistant's required English keys and enum values unchanged.

## Validation

After changing Python code, run all three commands from the repository root:

```bash
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

After changing frontend code, run these commands from the repository root:

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
node frontend/scripts/check-bundle.mjs
```

The change is complete when all commands pass and every modified user-facing string has an English source and a French translation.

## Frontend

- `frontend/` holds the Maison panel: Vite, React, TypeScript, Tailwind CSS, and shadcn components. Use pnpm with `--dir frontend`, never npm or npx.
- `pnpm --dir frontend build` writes the panel module to `custom_components/clacamieu/frontend/dist/`. Commit the rebuilt `dist/` with every frontend change. HACS installs from the repository tree, and CI fails when the committed bundle differs from a fresh build.
- `pnpm --dir frontend dev` serves the panel on `localhost:5174` with live data from the Home Assistant instance named by `HA_URL` and `HA_TOKEN` in the file at `CLACAMIEU_HA_ENV` (default `../homeassistant/.env` next to this repository). The development connection rejects service calls and every WebSocket command outside a read-only allowlist. Never print or commit these values. `check-bundle.mjs` fails when either value appears in `dist/`.
- The panel renders in its own shadow root. Keep user-facing strings in `frontend/src/i18n.ts` with English and French values, and keep Home Assistant data derivation in pure functions such as `buildHomeView`.

## Distribution

- Keep the repository compatible with HACS category `Integration`.
- Publish only `custom_components/clacamieu` as the integration directory.
- Keep the manifest version and project version aligned when preparing a release.
- Verify the repository with `git rev-parse --show-toplevel` before committing, tagging, or pushing.
