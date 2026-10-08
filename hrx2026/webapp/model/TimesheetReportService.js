sap.ui.define([
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"./Backend",
	"./TimesheetReport"
], function (Filter, FilterOperator, Backend, TimesheetReport) {
	"use strict";

	/*
	 * Where Timesheet Reporting gets its data - the one file to touch when the
	 * timesheet service gains an organisation-wide report.
	 *
	 * Until then there is no call that returns everybody's bookings, so
	 * loadBookings asks timesheet.xsjs?cmd=fetch for each active employee in turn
	 * (about 3s a call, a few at a time). An org-wide command only has to replace
	 * the body of loadBookings and hand back the same booking shape that
	 * TimesheetReport.fromAssignments builds; nothing on the page changes.
	 */

	// Calls in flight at once. Browsers hold about six connections to one host, and
	// the rest of the app still needs a few while the report is loading.
	var CONCURRENCY = 4;

	var RESOURCE_FIELDS = ["EmpID", "FName", "LName", "Email", "IsActive"];

	/**
	 * Runs fnTask over every item with at most iLimit running at once.
	 * @param {Array} aItems the items
	 * @param {number} iLimit how many at once
	 * @param {function} fnTask returns a promise for one item
	 * @returns {Promise<Array>} the results, in item order
	 */
	function pool(aItems, iLimit, fnTask) {
		var aResults = new Array(aItems.length);
		var iNext = 0;

		function worker() {
			if (iNext >= aItems.length) {
				return Promise.resolve();
			}
			var iIndex = iNext++;
			return fnTask(aItems[iIndex], iIndex).then(function (vResult) {
				aResults[iIndex] = vResult;
				return worker();
			});
		}

		var aWorkers = [];
		for (var i = 0; i < Math.min(iLimit, aItems.length); i++) {
			aWorkers.push(worker());
		}
		return Promise.all(aWorkers).then(function () {
			return aResults;
		});
	}

	return {

		/**
		 * The organisation's active employees, by name.
		 * @param {sap.ui.model.odata.v2.ODataModel} oModel the OData model
		 * @param {string} sOrgId the organisation
		 * @returns {Promise<Array<object>>} EmpID, Name and Email of each
		 */
		loadPeople: function (oModel, sOrgId) {
			return Backend.read(oModel, "/Resources", {
				urlParameters: { "$select": RESOURCE_FIELDS.join(",") },
				filters: [new Filter("OrgID", FilterOperator.EQ, sOrgId)]
			}).then(function (oData) {
				return ((oData && oData.results) || []).filter(function (oResource) {
					return oResource.IsActive === "Y" && oResource.Email;
				}).map(function (oResource) {
					return {
						EmpID: oResource.EmpID,
						Name: ((oResource.FName || "") + " " + (oResource.LName || "")).trim() || oResource.Email,
						Email: oResource.Email.toLowerCase()
					};
				}).sort(function (a, b) {
					return a.Name.localeCompare(b.Name);
				});
			});
		},

		/**
		 * Every booking with time in the range, for the given people.
		 * @param {Array<object>} aPeople from {@link loadPeople}
		 * @param {string} sOrgId the organisation
		 * @param {string} sFrom the first day, "yyyy-MM-dd"
		 * @param {string} sTo the last day, "yyyy-MM-dd"
		 * @param {function} [fnProgress] called with (done, of) as each person loads
		 * @returns {Promise<object>} bookings (see TimesheetReport) and failed - the
		 * people whose timesheets could not be read, so the page can say who is missing
		 */
		loadBookings: function (aPeople, sOrgId, sFrom, sTo, fnProgress) {
			var iDone = 0;
			var aFailed = [];

			if (fnProgress) {
				fnProgress(0, aPeople.length);
			}

			return pool(aPeople, CONCURRENCY, function (oPerson) {
				return Backend.getJson(Backend.query(Backend.TIMESHEET, {
					cmd: "fetch",
					Email: oPerson.Email,
					FromDate: sFrom,
					ToDate: sTo,
					OrgID: sOrgId
				})).then(function (oData) {
					return TimesheetReport.fromAssignments(oPerson, oData.assignments).filter(function (oBooking) {
						return oBooking.entries.length > 0;
					});
				}, function () {
					aFailed.push(oPerson);
					return [];
				}).then(function (aBookings) {
					iDone++;
					if (fnProgress) {
						fnProgress(iDone, aPeople.length);
					}
					return aBookings;
				});
			}).then(function (aPerPerson) {
				return {
					bookings: [].concat.apply([], aPerPerson),
					failed: aFailed
				};
			});
		},

		/**
		 * Hours booked against hours expected for everyone, over a range. One call -
		 * the missing timesheet report already covers the whole organisation and
		 * allows for leave and each person's work pattern.
		 * @param {string} sFrom the first day, "yyyy-MM-dd"
		 * @param {string} sTo the last day, "yyyy-MM-dd"
		 * @returns {Promise<Array<object>>} UserID, Name, Email, UserTypeKey,
		 * bookedMinutes, expectedMinutes and leaveMinutes
		 */
		loadWeek: function (sFrom, sTo) {
			return fetch(Backend.query(Backend.TIMESHEET, { cmd: "missingTimesheet", fromDate: sFrom, toDate: sTo }), {
				method: "GET"
			}).then(function (oResponse) {
				return oResponse.text().then(function (sBody) {
					var vJson = null;
					try {
						vJson = sBody ? JSON.parse(sBody) : null;
					} catch (oParseError) {
						vJson = null;
					}
					// This report answers with a bare array rather than the usual envelope.
					if (!oResponse.ok || !Array.isArray(vJson)) {
						throw new Error((vJson && (vJson.msg || vJson.message)) || sBody || oResponse.statusText);
					}
					return vJson;
				});
			}).then(function (aRows) {
				return aRows.map(function (oRow) {
					return {
						UserID: oRow.UserID,
						Name: ((oRow.FName || "") + " " + (oRow.LName || "")).trim() || oRow.Email,
						Email: (oRow.Email || "").toLowerCase(),
						UserTypeKey: oRow.UserTypeKey || "",
						bookedMinutes: Math.round((parseInt(oRow.ActualBookedInSecond, 10) || 0) / 60),
						expectedMinutes: Math.round((parseInt(oRow.ExpectedBookingInSecond, 10) || 0) / 60),
						leaveMinutes: Math.round((parseInt(oRow.LeaveTakenInSeconds, 10) || 0) / 60)
					};
				});
			});
		}
	};
});
