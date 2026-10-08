sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"bsx/hrx/hrx2026/ui/shell"
], function (Controller, shell) {
	"use strict";

	return Controller.extend("bsx.hrx.hrx2026.controller.App", {
		/**
		 * Mounts the HRX shell once its host element is in the page. The shell signs the
		 * user in (getUserDetail) and then starts the router.
		 */
		onHostRendered: function () {
			if (this._bMounted) { return; }
			var oHost = this.byId("hrxHost").getDomRef();
			if (!oHost) { return; }
			this._bMounted = true;
			shell.mount(oHost, this.getOwnerComponent().getRouter());
		}
	});
});
