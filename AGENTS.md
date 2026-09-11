# ResQRoute Agent Guide

## Project shape

ResQRoute is split into three independently run areas:

- `client/`: React 19 + Vite frontend using JSX and functional components.
- `server/`: CommonJS Express API with PostgreSQL, JWT authentication, and role checks.
- `ml/`: Standalone pandas/scikit-learn scripts for flood data preparation and model training.

Keep changes in the owning area unless the feature explicitly crosses the client/API/ML boundary. The ML scripts are not currently exposed through the server or client.

## Commands

Run commands from the directory that owns the package or script:

```powershell
cd client
npm install
npm run dev
npm run lint
npm run build
```

```powershell
cd server
npm install
npm run dev
npm start
```

The server has no configured tests: `npm test` is expected to exit with the package's "no test specified" error. The API listens on `http://localhost:5000`.

For ML work, run from `ml` so relative `data/...` and `models/...` paths resolve correctly:

```powershell
cd ml
.\venv\Scripts\Activate.ps1
python prepare_data.py
python train_model.py
python train_final_model.py
```

There is currently no ML dependency manifest or test command. Avoid assuming the checked-in virtual environment is available on another machine.

## Architecture and conventions

- The API entry point is `server/server.js`; route modules live in `server/routes/` and controllers in `server/controllers/`.
- New API resources should follow the existing route/controller split and be mounted in `server/server.js`.
- Database access goes through the shared pool in `server/db.js`. Use parameterized PostgreSQL queries and async controller functions.
- Authentication is in `server/middleware/authMiddleware`; authorization is in `server/middleware/roleMiddleware.js`. Preserve route-level auth and role checks when changing endpoints.
- Existing API groups are mounted under `/api/auth`, `/api/disasters`, `/api/shelters`, `/api/rescue-teams`, `/api/incidents`, `/api/roads`, `/api/resources`, and `/api/risk-zones`.
- Client code uses JSX, hooks, and the existing ESLint configuration. API calls use `VITE_API_BASE_URL` through `client/src/config.js`, defaulting to `http://localhost:5000` for local development.
- ML scripts use pandas, scikit-learn Random Forest models, and joblib. They read and write relative paths under `ml/data/` and `ml/models/`; generated artifacts may be overwritten by training commands.

## Environment and validation

- The server reads database settings and `JWT_SECRET` from `server/.env`. PostgreSQL must be running before database-backed endpoints are exercised.
- Start the server from `server`; `dotenv` currently relies on that working directory to load `.env`.
- The server allowlists comma-separated `CORS_ORIGIN` values (required in production); align it with the frontend's `VITE_API_BASE_URL`. Treat changes to either as integration changes and validate both processes.
- For client changes, run `npm run lint` and `npm run build` from `client`.
- For server changes, exercise the affected endpoint with the server running and verify authentication/authorization behavior; do not treat the unconfigured `npm test` script as a meaningful test.
- Do not commit secrets, `node_modules`, client build output, or local environment files. Do not modify checked-in ML datasets/models unless the task explicitly concerns generated artifacts.

## Documentation

Use [client/README.md](client/README.md) for the frontend's Vite baseline. Keep this guide focused on agent-facing project facts; put user-facing setup or feature documentation in the relevant README or dedicated documentation file.
