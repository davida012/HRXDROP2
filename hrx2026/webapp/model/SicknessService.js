sap.ui.define([
	"./Backend"
], function (Backend) {
	"use strict";

	/*
	 * The sickness backend - the one file to touch when the service is delivered.
	 *
	 * It is not built yet, so ENDPOINT is unset: every read answers with nothing (the
	 * page shows its empty states) and every write fails with a NOT_BOUND error the
	 * page reports as "not connected yet". Once the service exists, set ENDPOINT -
	 * e.g. Backend.SERVICE_ROOT + "/hrx/sickness.xsjs" - and, if its commands or
	 * field names differ from the ones below, map them here so the page keeps
	 * receiving the shapes documented on each method.
	 *
	 * Assumed to follow the other xsjs services: a "cmd" query parameter picks the
	 * operation, and each answer is an envelope of { msgType: "S", data: ... }.
	 */
	var ENDPOINT = null;

	function notBound() {
		var oError = new Error("The sickness service is not connected yet.");
		oError.notBound = true;
		return Promise.reject(oError);
	}

	function get(sCmd, oParams) {
		if (!ENDPOINT) {
			return Promise.resolve([]);
		}
		return Backend.getJson(Backend.query(ENDPOINT, Object.assign({ cmd: sCmd }, oParams)))
			.then(function (oJson) {
				return (oJson && oJson.data) || [];
			});
	}

	function post(sCmd, oPayload) {
		if (!ENDPOINT) {
			return notBound();
		}
		return Backend.postJson(Backend.query(ENDPOINT, { cmd: sCmd }), oPayload);
	}

	return {

		/**
		 * @returns {boolean} true once the service is bound
		 */
		isBound: function () {
			return !!ENDPOINT;
		},

		/**
		 * Every sickness absence starting in the range, for the whole organisation.
		 * @param {string} sOrgId the organisation
		 * @param {string} sFrom the first day, "yyyy-MM-dd"
		 * @param {string} sTo the last day, "yyyy-MM-dd"
		 * @returns {Promise<Array<object>>} absences: AbsenceID, EmpID, Name, Email,
		 * StartDate and EndDate ("yyyy-MM-dd"), Days (working days), Reason, Notes,
		 * FitNote ("Y"/"N") and Status ("OPEN" while return to work is outstanding,
		 * "ACTIONED" once it is complete)
		 */
		getAbsences: function (sOrgId, sFrom, sTo) {
			return get("absences", { OrgID: sOrgId, FromDate: sFrom, ToDate: sTo });
		},

		/**
		 * Records an absence. The service is expected to open a return-to-work process
		 * for the employee at the same time, unless one is already in progress, with
		 * the "fit note received" step already done when FitNote is "Y".
		 * @param {object} oAbsence OrgID, EmpID, StartDate, EndDate, Days, Reason, Notes,
		 * FitNote ("Y"/"N") and RecordedBy (the signed-in admin's email)
		 * @returns {Promise<object>} the service's answer
		 */
		recordAbsence: function (oAbsence) {
			return post("recordAbsence", oAbsence);
		},

		/**
		 * Every action logged against policy triggers in a financial year - a log, so
		 * one employee can have several (an email, then a dismissal, ...).
		 * @param {string} sOrgId the organisation
		 * @param {number} iFiscalYear the calendar year the financial year starts in
		 * @returns {Promise<Array<object>>} actions: EmpID, Status ("EMAILED"|"DISMISSED"),
		 * Note, InstanceCount (absences at the time of the action), ReviewedBy and
		 * ReviewedOn (when it was logged - a timestamp, or "yyyy-MM-dd")
		 */
		getTriggerReviews: function (sOrgId, iFiscalYear) {
			return get("triggerReviews", { OrgID: sOrgId, FiscalYear: iFiscalYear });
		},

		/**
		 * Logs an action on a trigger against the employee's attendance record. Only a
		 * dismissal closes the trigger; an email leaves it open, marked as emailed.
		 * @param {object} oReview OrgID, EmpID, FiscalYear, Status ("EMAILED"|"DISMISSED"),
		 * Note (the dismissal reason, or the email sent), InstanceCount and ReviewedBy
		 * @returns {Promise<object>} the service's answer
		 */
		reviewTrigger: function (oReview) {
			return post("reviewTrigger", oReview);
		},

		/**
		 * Every return-to-work process still in progress.
		 * @param {string} sOrgId the organisation
		 * @returns {Promise<Array<object>>} processes: RtwID, EmpID, Name, Email, Title
		 * (job title) and Steps - an array of { StepNo, Text, Done ("Y"/"N") }
		 */
		getReturnsToWork: function (sOrgId) {
			return get("returnsToWork", { OrgID: sOrgId });
		},

		/**
		 * @param {string} sRtwId the process
		 * @param {number} iStepNo the step to mark done
		 * @param {string} sBy the signed-in admin's email
		 * @returns {Promise<object>} the service's answer
		 */
		completeRtwStep: function (sRtwId, iStepNo, sBy) {
			return post("completeRtwStep", { RtwID: sRtwId, StepNo: iStepNo, CompletedBy: sBy });
		},

		/**
		 * Closes a return-to-work process. The page only offers this once every step is
		 * done; the service should refuse it otherwise.
		 * @param {string} sRtwId the process
		 * @param {string} sBy the signed-in admin's email
		 * @returns {Promise<object>} the service's answer
		 */
		completeRtw: function (sRtwId, sBy) {
			return post("completeRtw", { RtwID: sRtwId, CompletedBy: sBy });
		}
	};
});
