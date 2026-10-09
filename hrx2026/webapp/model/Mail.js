sap.ui.define([
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Label",
	"sap/m/TextArea",
	"sap/m/Input",
	"sap/m/VBox",
	"sap/m/HBox",
	"sap/m/MessageStrip",
	"sap/m/MessageToast"
], function (Dialog, Button, Label, TextArea, Input, VBox, HBox, MessageStrip, MessageToast) {
	"use strict";

	/*
	 * Opens a drafted email in the user's own email app.
	 *
	 * A mailto: link only works when the browser has an email app to hand it to, and a
	 * page that sends itself to one (what URLHelper.triggerEmail does) is ignored
	 * silently when it has not - which is common on work machines, and inside the
	 * frames a launchpad or Business Application Studio can put the app in. So the
	 * link is followed as a real link, and if the browser has not handed over to an
	 * email app shortly afterwards, the draft is shown so it can be copied instead.
	 */

	// How long to wait for the browser to hand over before offering the draft.
	var HANDOVER_WAIT = 1200;

	function mailtoUrl(oDraft) {
		var aParts = [];
		if (oDraft.cc) {
			aParts.push("cc=" + encodeURIComponent(oDraft.cc));
		}
		if (oDraft.bcc) {
			aParts.push("bcc=" + encodeURIComponent(oDraft.bcc));
		}
		if (oDraft.subject) {
			aParts.push("subject=" + encodeURIComponent(oDraft.subject));
		}
		if (oDraft.body) {
			aParts.push("body=" + encodeURIComponent(oDraft.body));
		}
		return "mailto:" + (oDraft.to || "").split(",").map(function (sAddress) {
			return encodeURIComponent(sAddress.trim());
		}).join(",") + (aParts.length ? "?" + aParts.join("&") : "");
	}

	function copy(sText, oField) {
		var fnSelect = function () {
			var oDom = oField && oField.getFocusDomRef();
			if (oDom) {
				oDom.focus();
				oDom.select();
			}
		};
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(sText).then(function () {
				MessageToast.show("Copied");
			}, fnSelect);
		} else {
			fnSelect();
		}
	}

	function field(sLabel, sValue, bMultiLine) {
		var oField = bMultiLine ?
			new TextArea({ value: sValue, editable: false, width: "100%", rows: 7, growing: true, growingMaxLines: 12 }) :
			new Input({ value: sValue, editable: false, width: "100%" });
		return new VBox({
			items: [
				new HBox({
					justifyContent: "SpaceBetween",
					alignItems: "Center",
					items: [
						new Label({ text: sLabel }),
						new Button({
							text: "Copy",
							type: "Transparent",
							icon: "sap-icon://copy",
							press: function () {
								copy(sValue, oField);
							}
						})
					]
				}),
				oField
			]
		}).addStyleClass("sapUiSmallMarginBottom");
	}

	function showDraft(oDraft) {
		var aItems = [
			new MessageStrip({
				text: "Your email app did not open. Copy the details into a new email instead.",
				type: "Information",
				showIcon: true
			}).addStyleClass("sapUiSmallMarginBottom")
		];
		if (oDraft.to) {
			aItems.push(field("To", oDraft.to));
		}
		if (oDraft.bcc) {
			aItems.push(field("Bcc", oDraft.bcc));
		}
		if (oDraft.subject) {
			aItems.push(field("Subject", oDraft.subject));
		}
		if (oDraft.body) {
			aItems.push(field("Message", oDraft.body, true));
		}

		var oDialog = new Dialog({
			title: "Email draft",
			contentWidth: "34rem",
			content: new VBox({ items: aItems }),
			endButton: new Button({
				text: "Close",
				press: function () {
					oDialog.close();
				}
			}),
			afterClose: function () {
				oDialog.destroy();
			}
		}).addStyleClass("sapUiContentPadding");
		oDialog.open();
	}

	return {

		/**
		 * @param {object} oDraft to (comma-separated), cc, bcc, subject and body
		 */
		open: function (oDraft) {
			var bHandedOver = false;
			var fnHandOver = function () {
				bHandedOver = true;
			};

			// A browser that hands the link to an email app takes focus away from the page.
			window.addEventListener("blur", fnHandOver, { once: true });
			document.addEventListener("visibilitychange", fnHandOver, { once: true });

			var oLink = document.createElement("a");
			oLink.href = mailtoUrl(oDraft);
			oLink.target = "_top";
			oLink.rel = "noopener";
			oLink.style.display = "none";
			document.body.appendChild(oLink);
			try {
				oLink.click();
			} catch (oError) {
				// handled below as "nothing opened"
			}
			document.body.removeChild(oLink);

			setTimeout(function () {
				window.removeEventListener("blur", fnHandOver);
				document.removeEventListener("visibilitychange", fnHandOver);
				if (!bHandedOver) {
					showDraft(oDraft);
				}
			}, HANDOVER_WAIT);
		},

		mailtoUrl: mailtoUrl
	};
});
