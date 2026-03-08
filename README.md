# Darts League Vierge

Application React/Vite pour gérer une ligue de fléchettes (mobile + TV mode).

## Lancer en local

```bash
npm install
npm run dev
```

## Scripts qualité

```bash
npm run typecheck   # TypeScript
npm run test:ci     # tests unitaires Vitest
npm run build       # build production Vite
npm run check       # typecheck + tests + build
```

## CI GitHub Actions (Point 5)

Le workflow `quality-gate.yml` exécute automatiquement:

1. `npm ci`
2. `npm run typecheck`
3. `npm run test:ci`
4. `npm run build`

Il tourne sur:

1. push sur `main` et `feature-system`
2. pull request vers `main`
3. lancement manuel (`workflow_dispatch`)

Chemin du workflow: `.github/workflows/quality-gate.yml`.
