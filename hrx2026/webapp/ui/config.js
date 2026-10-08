/*
 * App-wide switches.
 */
sap.ui.define([], function () {
	"use strict";

	return {
		/**
		 * TEMPORARY, for testing: everyone sees the manager pages (Admin only group, the
		 * manager dashboard) and gets the "View as" switch at the foot of the side rail.
		 * The real check still runs — getUserDetail().isManager, or having anyone report
		 * to you — and the side rail shows its result. Set to false before go-live so
		 * only managers see the manager pages.
		 */
		TEST_SHOW_ALL: true,

		/**
		 * The SAP Document Management repository holding profile pictures and logos - the
		 * one the HRX service uploads into (srv/hrx-services.js, repositoryId). Users and
		 * clients carry their own ImageRootID / LogoRootID; this is the fallback.
		 */
		DMS_REPOSITORY: "0dc65852-e10f-4a43-8cab-43397e9739e4",

		// Tia and Vicky run resourcing and payroll without line reports of their own, so the
		// service does not flag them as managers - but they need everything a manager has.
		MANAGER_EXCEPTIONS: [
			"tia.menhennet@bluestonex.com",
			"vicky.williams@bluestonex.com"
		]
	};
});
