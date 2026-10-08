sap.ui.define([
	"sap/ui/core/UIComponent",
	"bsx/hrx/hrx2026/ui/service"
], function (UIComponent, service) {
	"use strict";

	// Fonts and icons the HRX design uses. index.html links them too; in the launchpad
	// that page is not used, so the component adds them itself.
	var LINKS = [
		"https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&display=swap",
		"https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css"
	];

	return UIComponent.extend("bsx.hrx.hrx2026.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			UIComponent.prototype.init.apply(this, arguments);

			LINKS.forEach(function (sHref) {
				if (!document.querySelector("link[href=\"" + sHref + "\"]")) {
					var l = document.createElement("link");
					l.rel = "stylesheet";
					l.href = sHref;
					document.head.appendChild(l);
				}
			});

			// every call to the HRX CAP service goes through the manifest's data source,
			// so the approuter route (xs-app.json: /hrx -> destination hrxservice) applies
			var oSource = this.getManifestEntry("/sap.app/dataSources/hrxService");
			service.setBase(this.getManifestObject().resolveUri(oSource.uri));
			// the shell starts the router once the signed-in user is known (see App.controller)
		}
	});
});
