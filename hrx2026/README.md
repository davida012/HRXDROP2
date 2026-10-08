# HRX2026

## Backend

The app's backend is the **HRX service** (`bsx-hrx-srv`, OData V4, CAP), reached at `/hrx`.

| Running as | `/hrx` goes to |
| --- | --- |
| Deployed on BTP | the `hrxservices` destination (`xs-app.json`), signed in as the user |
| Local preview (`npm run start-noflp`) | `http://localhost:4004` (`ui5.yaml`) - a local copy of the HRX service |

The deployed service only answers a signed-in user, so a local preview needs its own copy of the
service running on port 4004 (`cds watch` in the CAP project).

### How the pages use it

The pages were written against the older xsjs commands (`timesheet.xsjs?cmd=fetch`, ...) and the
`services.xsodata` OData V2 service. Rather than rewrite every page, `model/Backend.js` hands their
calls to `model/HrxLegacy.js`, which answers them from `/hrx` in the shapes the pages already read.
`Backend.USE_HRX` switches this on and off.

Some data has no home in the HRX service and still comes from the original services
(`bsxorgappsservices`): client SLAs, licensed apps and components, BTP services, client support
users, project attachments and project tasks. Sickness trigger reviews and return-to-work
checklists have no home anywhere yet (see `model/SicknessService.js`).

| File | What it does |
| --- | --- |
| `model/Hrx.js` | Small client for the HRX service: paged reads, create, update, delete, functions, actions |
| `model/HrxTime.js` | People, bookings, projects, rates, and each person's expected hours |
| `model/HrxLegacy.js` | Answers the old xsjs commands and OData reads from `/hrx` |
| `model/TimesheetReportService.js` | Timesheet Reporting's reads |
| `model/SicknessService.js` | Sickness absences (as Sick leave) and the parts still to be stored |

### Things to confirm against the deployed service

- **Leave status.** `Leaves.Status_ID` points at a status table the service does not expose. Until its
  ids are listed in `LEAVE_STATUS_IDS` (`model/HrxLegacy.js`), a leave's state is read from the
  request: no approval needed means approved, otherwise `WFFlag` (true approved, false rejected,
  empty pending) - as the hrx2023 app used it.
- **Project types.** `FXD` and `TNM` are billable, `INT` and `FOC` are not (`model/HrxTime.js`).
- **Leave year.** Allowance used and balance are counted per calendar year (`leaveYear` in
  `model/HrxLegacy.js`).
