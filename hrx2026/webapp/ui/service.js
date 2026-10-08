/*
 * Client for the HRX CAP service (OData V4, service path /hrx).
 *
 * The app reaches it through the approuter route /hrx/* -> destination "hrxservice"
 * (see xs-app.json and mta.yaml); the approuter attaches the signed-in user's token.
 * Every endpoint the service exposes has a named method here, so a page never builds
 * an OData URL by hand.
 *
 * Reads go out as plain OData V4 JSON requests. Writes fetch an X-CSRF-Token first (the
 * approuter enforces one) and retry once when the token has expired.
 */
sap.ui.define([], function () {
	"use strict";

	var BASE = sap.ui.require.toUrl("bsx/hrx/hrx2026") + "/hrx/";
	var STATUS = {
		requested: "e7ab05aa-d0d3-11ee-b777-325096b39f47",
		approved: "e7ab02da-d0d3-11ee-b96f-325096b39f47",
		rejected: "e7ab06f4-d0d3-11ee-bc32-325096b39f47"
	};
	var GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	var DATE = /^\d{4}-\d{2}-\d{2}$/;

	var sCsrf = null;
	var aLog = [];   // every call made, for the service status table

	function track(sName, bOk, nStatus) {
		var o = aLog.find(function (x) { return x.name === sName; });
		if (!o) { o = { name: sName, ok: 0, failed: 0 }; aLog.push(o); }
		if (bOk) { o.ok++; } else { o.failed++; o.lastStatus = nStatus; }
	}

	// an OData literal: dates and guids bare, numbers bare, everything else quoted
	function lit(v) {
		if (typeof v === "number" || typeof v === "boolean") { return String(v); }
		if (v == null) { return "null"; }
		v = String(v);
		if (DATE.test(v)) { return v; }
		return "'" + encodeURIComponent(v.replace(/'/g, "''")) + "'";
	}
	function keyLit(v) {
		if (typeof v === "number") { return String(v); }
		return GUID.test(String(v)) ? String(v) : "'" + encodeURIComponent(String(v).replace(/'/g, "''")) + "'";
	}
	function key(o) {
		var aKeys = Object.keys(o);
		if (aKeys.length === 1) { return "(" + keyLit(o[aKeys[0]]) + ")"; }
		return "(" + aKeys.map(function (k) { return k + "=" + keyLit(o[k]); }).join(",") + ")";
	}
	function qs(q) {
		if (!q) { return ""; }
		var a = Object.keys(q).filter(function (k) { return q[k] != null && q[k] !== ""; }).map(function (k) { return k + "=" + encodeURIComponent(q[k]).replace(/%2C/g, ",").replace(/%24/g, "$").replace(/%3D/g, "=").replace(/%3B/g, ";").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%27/g, "'"); });
		return a.length ? "?" + a.join("&") : "";
	}

	async function errorOf(r) {
		var sMsg = r.status + " " + r.statusText;
		try {
			var t = await r.text();
			try { var j = JSON.parse(t); sMsg = (j.error && (j.error.message || (j.error.details && j.error.details[0] && j.error.details[0].message))) || j.message || sMsg; }
			catch (e) { if (t && t.length < 300) { sMsg = t; } }
		} catch (e) { /* keep the status line */ }
		var err = new Error(sMsg);
		err.status = r.status;
		return err;
	}

	async function fetchCsrf() {
		var r = await fetch(BASE, { method: "GET", headers: { "X-CSRF-Token": "Fetch", "Accept": "application/json" }, credentials: "include" });
		sCsrf = r.headers.get("x-csrf-token") || "unsafe";
		return sCsrf;
	}

	async function request(sMethod, sPath, oBody, sName, oHeaders) {
		var bWrite = sMethod !== "GET";
		var go = async function () {
			var h = Object.assign({ "Accept": "application/json" }, oHeaders || {});
			if (bWrite) { h["X-CSRF-Token"] = sCsrf || await fetchCsrf(); }
			var body = oBody;
			if (oBody !== undefined && !(oBody instanceof Blob) && !(oBody instanceof FormData)) { h["Content-Type"] = "application/json"; body = JSON.stringify(oBody); }
			return fetch(BASE + sPath, { method: sMethod, headers: h, body: body, credentials: "include" });
		};
		var r = await go();
		if (r.status === 403 && bWrite && (r.headers.get("x-csrf-token") || "").toLowerCase() === "required") { sCsrf = null; r = await go(); }
		if (r.status === 401 || (r.redirected && /login|authorize/i.test(r.url))) {
			track(sName, false, 401);
			var e401 = new Error("Your session has expired. Reload the page to sign in again.");
			e401.status = 401;
			throw e401;
		}
		if (!r.ok) { track(sName, false, r.status); throw await errorOf(r); }
		track(sName, true);
		if (r.status === 204) { return null; }
		var t = await r.text();
		return t ? JSON.parse(t) : null;
	}

	// GET a collection, following server-driven paging
	async function getAll(sSet, q) {
		var out = [], sPath = sSet + qs(q), n = 0;
		while (sPath && n++ < 60) {
			var j = await request("GET", sPath, undefined, sSet);
			out = out.concat(j.value || []);
			var next = j["@odata.nextLink"];
			sPath = next ? next.replace(/^.*?\/hrx\//, "").replace(/^\//, "") : null;
		}
		return out;
	}

	// functions return { value: ... }; CAP wraps a single object in an array when the
	// function is declared to return "array of String"
	function unwrap(j, bOne) {
		var v = j && Object.prototype.hasOwnProperty.call(j, "value") ? j.value : j;
		if (bOne && Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) { return v[0]; }
		if (typeof v === "string" && bOne) { try { return JSON.parse(v); } catch (e) { return v; } }
		return v;
	}
	async function fn(sName, oParams, bOne) {
		var a = Object.keys(oParams || {}).map(function (k) { return k + "=" + lit(oParams[k]); });
		return unwrap(await request("GET", sName + "(" + a.join(",") + ")", undefined, sName), bOne);
	}
	async function action(sName, oBody) {
		return unwrap(await request("POST", sName, oBody, sName));
	}

	var crud = function (sSet) {
		return {
			list: function (q) { return getAll(sSet, q); },
			get: function (k, q) { return request("GET", sSet + key(k) + qs(q), undefined, sSet); },
			create: function (o) { return request("POST", sSet, o, sSet); },
			update: function (k, o) { return request("PATCH", sSet + key(k), o, sSet); },
			remove: function (k) { return request("DELETE", sSet + key(k), undefined, sSet); }
		};
	};

	var svc = {
		BASE: BASE,
		/** @param {string} sUri the hrxService data source URI, resolved against the app */
		setBase: function (sUri) { BASE = sUri.replace(/\/?$/, "/"); svc.BASE = BASE; sCsrf = null; },
		STATUS: STATUS,
		log: aLog,
		lit: lit,
		// a literal for use inside $filter (the query string is encoded as a whole later)
		q: function (v) {
			if (typeof v === "number" || typeof v === "boolean") { return String(v); }
			v = String(v);
			return DATE.test(v) || GUID.test(v) ? v : "'" + v.replace(/'/g, "''") + "'";
		},
		inList: function (sField, aValues) {
			// "(f eq 'a' or f eq 'b')" — CAP v6 also understands "in", but the explicit form is safe everywhere
			if (!aValues.length) { return sField + " eq null and " + sField + " ne null"; }
			return "(" + aValues.map(function (v) { return sField + " eq " + svc.q(v); }).join(" or ") + ")";
		},

		/* ── entity sets ── */
		Organisations: crud("Organisations"),
		Sites: crud("Sites"),
		Contacts: crud("Contacts"),
		Users: crud("Users"),
		Clients: crud("Clients"),
		Projects: crud("Projects"),
		Assets: crud("Assets"),
		AssetAssignment: crud("AssetAssignment"),
		WorkSchedule: crud("WorkSchedule"),
		UserToProject: crud("UserToProject"),
		BillingScheme: crud("BillingScheme"),
		TimeLog: crud("TimeLog"),
		BankHolidays: crud("BankHolidays"),
		Leaves: crud("Leaves"),
		LeaveType: crud("LeaveType"),
		Bonus: crud("Bonus"),
		ContactObjectTypes: crud("ContactObjectTypes"),

		/** Documents: profile pictures and logos, stored in the document service. objectType is User, Client, Site or Org. */
		uploadDocument: function (sObjectType, sObjectID, sFolderID, oFile) {
			var fd = new FormData();
			fd.append("file", oFile, oFile.name);
			return request("PUT", "Documents(objectID=" + keyLit(sObjectID) + ",objectType=" + keyLit(sObjectType) + ",objectFolderID=" + keyLit(sFolderID || "") + ")/content", fd, "Documents");
		},

		/* ── functions ── */
		getUserDetail: function () { return fn("getUserDetail", {}, true); },
		fetchAssignments: function (sFrom, sTo) { return fn("fetchAssignments", { FromDate: sFrom, ToDate: sTo }, true); },
		fetchUserDetails: function (sFrom, sTo) { return fn("fetchUserDetails", { FromDate: sFrom, ToDate: sTo }, true); },
		fetchUserLeave: function () { return fn("fetchUserLeave", {}, true); },
		fetchLeaveAnalytics: function () { return fn("fetchLeaveAnalytics", {}); },
		leaveDates: function (sFrom, sTo) { return fn("leaveDates", { FromDate: sFrom, ToDate: sTo }, true); },
		leaveDatesForTeamCalendar: function (sFrom, sTo, sEmp) { return fn("leaveDatesForTeamCalendar", { FromDate: sFrom, ToDate: sTo, EmployeeID: sEmp }, true); },
		fetchTeamCalendar: function (sFrom, sTo) { return fn("fetchTeamCalendar", { FromDate: sFrom, ToDate: sTo }, true); },
		leaveToApprove: function () { return fn("leaveToApprove", {}); },
		fetchMyBonus: function () { return fn("fetchMyBonus", {}, true); },
		fetchBonusHeader: function (sEmp) { return fn("fetchBonusHeader", { EmpID: sEmp }, true); },
		fetchBonusUserList: function (nMonth, nYear) { return fn("fetchBonusUserList", { month: nMonth, year: nYear }, true); },
		fetchBonusList: function (nMonth, nYear, sSite, sEmp) { return fn("fetchBonusList", { Month: nMonth, Year: nYear, BaseSite: sSite, EmpID: sEmp }, true); },

		/* ── actions ── */
		saveTimesheetEntry: function (aTimeLog) { return action("saveTimesheetEntry", { timeLog: aTimeLog }); },
		deleteTimesheetEntry: function (aIds) { return action("deleteTimesheetEntry", { deleteEntry: aIds.map(function (id) { return { ID: id }; }) }); },
		createLeaveRequest: function (aRows) { return action("createLeaveRequest", { userLog: aRows }); },
		createLeaveRequestForTeamCalendar: function (aRows) { return action("createLeaveRequestForTeamCalendar", { userLog: aRows }); },
		actionOnLeave: function (aRows) { return action("actionOnLeave", { LeaveLog: aRows }); },
		submitBonus: function (aRows) { return action("submitBonus", { IBonus: aRows }); }
	};
	return svc;
});
