sap.ui.define([
	"./HrxTime"
], function (HrxTime) {
	"use strict";

	/*
	 * The answers the pages were written against, rebuilt from the HRX service.
	 *
	 * The app grew up on xsjs commands (timesheet.xsjs?cmd=fetch and so on) and every
	 * page reads their response shapes. Rather than rewrite each page around the HRX
	 * entity model, each command it used is answered here, from /hrx, in the shape the
	 * page already expects - so moving a page is a change of one call.
	 */

	function hhmmss(iMinutes) {
		var iWhole = Math.max(0, Math.round(iMinutes || 0));
		return String(Math.floor(iWhole / 60)).padStart(2, "0") + ":" + String(iWhole % 60).padStart(2, "0") + ":00";
	}

	return {

		/**
		 * timesheet.xsjs?cmd=missingTimesheet - hours booked against hours expected for
		 * every active person over a range. A bare array, as that command returned.
		 * @param {string} sFrom the first day, "yyyy-MM-dd"
		 * @param {string} sTo the last day, "yyyy-MM-dd"
		 * @returns {Promise<Array<object>>} one row per person
		 */
		missingTimesheet: function (sFrom, sTo) {
			return HrxTime.compliance(sFrom, sTo).then(function (aRows) {
				return aRows.map(function (oRow) {
					var iMissing = Math.max(0, oRow.expectedMinutes - oRow.bookedMinutes);
					return {
						UserID: oRow.UserID,
						FName: oRow.FirstName,
						LName: oRow.LastName,
						Email: oRow.Email,
						Pic: "",
						UserTypeKey: oRow.UserTypeKey,
						BaseSiteKey: oRow.SiteID,
						ExpectedBookingInSecond: oRow.expectedMinutes * 60,
						ActualBookedInSecond: oRow.bookedMinutes * 60,
						MissingTimeInSecond: iMissing * 60,
						LeaveTakenInSeconds: oRow.leaveMinutes * 60,
						ExpectedBookingInHour: hhmmss(oRow.expectedMinutes),
						ActualBookedInHour: hhmmss(oRow.bookedMinutes),
						MissingTimeInHour: hhmmss(iMissing),
						LeaveTakenInHours: hhmmss(oRow.leaveMinutes)
					};
				});
			});
		}
	};
});
