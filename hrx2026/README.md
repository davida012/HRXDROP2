# HRX — HR Suite (Drop 2)

The HRX Drop 2 design, built as a UI5 application on the HRX CAP service.

## How it is put together

- `webapp/Component.js`, `view/App.view.xml`, `controller/App.controller.js` — the UI5 shell. The router decides which page is on screen, so deep links and the launchpad's back button work.
- `webapp/ui/` — the HRX frame and pages. They render the design's own markup and stylesheet (`css/hrx.css`, the prototype's CSS scoped under `.hrx`), so the app looks exactly like the prototype.
  - `service.js` — one named method per HRX endpoint (entities, functions, actions), CSRF handling, paging, errors.
  - `data.js` — sign-in, the manager check, cached reference data and shared calculations (leave grouping, weekly compliance, utilisation, sickness triggers).
  - `config.js` — `TEST_SHOW_ALL` (see below) and the manager exceptions.
  - `preview.js` — sample data for the parts of the design the service has no endpoint for. Every page that uses it says so.
  - `pages/*.js` — one module per page.
- `webapp/css/hrx-mobile.css` — tablets and phones: tiles go two-up below 1200px, cards stack below 1000px, the side rail becomes a drawer opened from the top bar below 900px, and below 640px forms go single-column while wide tables and the team calendar scroll sideways (names pinned).
- `docs/screenshots/{desktop,tablet,phone}` — every page at 1440×900, 768×1024 (iPad) and 390×844 (iPhone 14).
- `webapp/localService/hrx/metadata.xml` — the HRX service's metadata.
- `mock/` — a local stand-in for the HRX service (dev only, not deployed). It is a small local npm package (`hrx-mock-service`, a devDependency) with its own `ui5.yaml`, so the app's `ui5*.yaml` files stay single YAML documents, which SAP Fiori tools (Preview Application) requires.

## The HRX service

`hrx/` calls go through the approuter route in `xs-app.json` to the destination **`hrxservice`**, which `mta.yaml` creates in the app's destination service:

- URL `https://bsx-tdd-tdd-bsx-hrx-srv.cfapps.eu10.hana.ondemand.com`
- `OAuth2UserTokenExchange` with the CAP service's own XSUAA instance (`bsx-hrx-xsuaa`, key `bsx-hrx-xsuaa-key`), so the service receives a token issued to it for the signed-in user.

If that instance has another name in your space, change `bsx-hrx-xsuaa` in `mta.yaml`, or delete the `hrxservice` entry there and create a subaccount destination called `hrxservice` instead.

## Profile pictures and logos

Pictures live in SAP Document Management, as in hrx2023: a user's `ImageObjectID` (a client's `LogoObjectID`) is a document in repository `0dc65852-e10f-4a43-8cab-43397e9739e4` (`ImageRootID` / `LogoRootID`, fallback in `config.js`). The app shows them from `browser/<repository>/root?cmisselector=content&objectId=<id>`, which `xs-app.json` routes to the subaccount destination **`dms_service`** (the one hrx2023 uses). Uploads go through the HRX service's `Documents` entity (Manage Resources → Info → Picture, Manage Clients → Logo). Anyone without a picture, or whose picture cannot be loaded, shows their initials. Only real pictures are ever shown: locally the mock has none (everyone shows initials) unless you start it with `HRX_DMS_TOKEN=<token for SAP Document Management>`, which fetches them from the real document store; a picture you upload locally is kept and shown back.

## Who sees what

The signed-in user is resolved by `getUserDetail()`. Managers are those the service flags (`isManager`), anyone with people reporting to them, and the exceptions in `config.js`.

**Temporary, for testing:** `TEST_SHOW_ALL: true` in `webapp/ui/config.js` shows everyone the manager pages, and puts a *View as (testing)* switch at the foot of the side rail. The real result of the check is shown next to the user's name. Set it to `false` before go-live.

## Running locally

```bash
npm install
npm run start-hrx      # http://localhost:8080/index.html
```

The deployed service only accepts XSUAA tokens, so locally `/hrx` is answered by `mock/hrx-mock-middleware.js`: the same entity sets, functions, actions and response shapes as the CAP handlers, seeded with realistic data, writes kept until the server restarts. `HRX_MOCK_USER=someone@bluestonex.com` signs in as someone else.

To run against the real service, start with a bearer token for it:

```bash
HRX_TOKEN=<token> npm run start-hrx
```

`App Explorer → HRX services` lists every endpoint, which page uses it, and a live check of each read.

## What the service does not have yet

| Missing | Where it shows | Shown as |
|---|---|---|
| Policy documents and acknowledgements | Policies to read, Documents, Home KPI | Sample data, flagged |
| Notifications / reminder sending | Bell, Remind buttons | Bell worked out from live data; reminders open the mail app |
| Sickness trigger outcomes, return-to-work steps | Sickness | Kept in the browser |
| Client support team, SLA, components, application services | Manage Clients | Sample data, flagged |
| Project areas, client team, attachments | Manage Projects | Sample data, flagged |
| Job title, contact name, day cost, bonus objectives / feedback | Several | Left out or marked |
