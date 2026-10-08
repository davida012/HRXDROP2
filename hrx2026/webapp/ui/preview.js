/*
 * Sample data for the parts of the prototype the HRX service has no endpoint for yet:
 * policy documents and acknowledgements, client support teams / SLAs / licensed
 * components / application services, project areas / client teams / attachments, and
 * the return-to-work checklist. It is the prototype's own sample data, so those pages
 * still look and behave as designed; every page that shows it says so, and nothing in
 * here is saved anywhere.
 */
sap.ui.define(["./core"], function (hrx) {
	"use strict";

	var osw = ["Aditi Arora", "Alice Galais", "Andrew Walker", "Bala Subramanian", "Carol Barton", "Christine Williams", "Dan Barton", "Jack Roberts", "Kyle Barnfield", "Nick Sullivan", "Richard Henry", "Sam Evans", "Steve Tomkins", "Tina Porter", "Inaya Farooqui", "Jacob Ellwood", "Helen Marsh", "Oliver Grant", "Megan Price", "Tom Hughes", "Laura Bennett", "Callum Reid", "Emma Doyle", "Ryan Walsh", "Sophie Turner", "Daniel Cross", "Hannah Fraser"];
	var aur = ["Altaf Khan", "Aman", "Burhanuddin Taheri", "Chandru Ranganathan", "Sabarinathan Chandrasekar", "Yuvaraj Kumar", "Feroz Khan", "Gaurav Kumar", "Mamoon Farooqui", "Namir Khan", "Shubhada Kolte", "Vikash", "Rohan Deshmukh", "Sneha Patil", "Imran Shaikh", "Ananya Joshi"];
	var people = osw.map(function (n) { return { name: n, site: "Oswestry" }; }).concat(aur.map(function (n) { return { name: n, site: "Aurangabad" }; }));
	var ME = "Sam Evans";   // the sample data's own employee; the signed-in user stands in for them

	var y = hrx.today().getFullYear();
	var docs = [
		{ id: "away", name: "Company Away Day - Logistics", cat: "Other", ver: "1.0", pub: y + "-07-08", vis: "All employees", req: false },
		{ id: "infosec", name: "Information Security Policy", cat: "Policy", ver: "1.0", pub: y + "-06-30", vis: "All employees", req: true, want: 43, me: true },
		{ id: "remote", name: "Remote Working Policy", cat: "Policy", ver: "1.0", pub: y + "-05-12", vis: "All employees", req: true, want: 20, me: false },
		{ id: "expenses", name: "Expenses & Travel Procedure", cat: "Procedure", ver: "1.0", pub: y + "-04-02", vis: "All employees", req: true, want: 23, me: true },
		{ id: "fire", name: "Oswestry Office Fire Procedure", cat: "Procedure", ver: "1.0", pub: y + "-03-18", vis: "Oswestry", req: true, want: 14, me: false },
		{ id: "handbook", name: "Employee Handbook " + y, cat: "Handbook", ver: "1.0", pub: y + "-01-08", vis: "All employees", req: true, want: 31, me: true }
	];
	var audience = function (d) { return people.filter(function (p) { return d.vis === "All employees" || p.site === d.vis; }); };
	docs.forEach(function (d) {
		d.ackBy = new Set();
		if (!d.req) { return; }
		var order = audience(d).map(function (p) { return p.name; }).sort(function (a, b) { return hrx.hash(a + d.id) - hrx.hash(b + d.id); }).filter(function (n) { return n !== ME; });
		if (d.me) { order.unshift(ME); } else { order.push(ME); }
		order.slice(0, d.want).forEach(function (n) { d.ackBy.add(n); });
	});

	var preview = {
		ME: ME,
		people: people,
		docs: docs,
		audience: audience,
		ackPct: function (d) { var t = audience(d).length; return t ? Math.round(d.ackBy.size / t * 100) : 100; },
		ackState: function (d) { var p = preview.ackPct(d); return p >= 100 ? "ok" : (p >= 80 ? "warn" : "crit"); },
		lowAckCount: function () { return docs.filter(function (d) { return d.req && preview.ackPct(d) < 80; }).length; },

		clientExtras: {
			"Babcock International": {
				users: [{ first: "Gareth", last: "Pryce", email: "gareth.pryce@babcock.example", mobile: "", active: true, admin: true }, { first: "Lena", last: "Hart", email: "lena.hart@babcock.example", mobile: "", active: true, admin: false }],
				sla: [{ sev: "Very High", resp: 1, res: 4 }, { sev: "High", resp: 2, res: 8 }, { sev: "Medium", resp: 4, res: 24 }],
				comps: [{ sw: "SAP S/4HANA", comp: "MM", sub: "Inventory management", from: (y - 1) + "-01-01", till: y + "-12-31", supported: true, sys: "BAB-PRD-01", install: "2023-03-01", ver: "2023 FPS02", obj: 12000, sup: 3500, cloud: false, show: false, warn: "", hard: "" },
					{ sw: "SAP Fiori", comp: "UX", sub: "Launchpad", from: (y - 1) + "-01-01", till: y + "-06-30", supported: false, sys: "BAB-PRD-01", install: "2023-03-01", ver: "2023 FPS02", obj: 0, sup: 0, cloud: false, show: true, warn: "Support has lapsed for this component", hard: "" }],
				apps: [{ app: "Maextro Monitor", svc: "Support", from: (y - 1) + "-01-01", till: y + "-12-31" }]
			},
			"BAE Applied Intelligence": {
				users: [{ first: "Imogen", last: "Shaw", email: "imogen.shaw@bae.example", mobile: "", active: true, admin: true }],
				sla: [{ sev: "High", resp: 2, res: 8 }, { sev: "Low", resp: 8, res: 48 }], comps: [], apps: []
			}
		},
		clientOf: function (sName) {
			return preview.clientExtras[sName] || (preview.clientExtras[sName] = { users: [], sla: [], comps: [], apps: [] });
		},

		AREAS: ["Basis", "Development", "Functional", "Integration", "Testing", "UX Design"],
		projectAreas: {
			"Babcock Maextro Support": ["Basis", "Functional"], "BAE Maextro Support": ["Functional"], "BSX Internal Development": ["Development", "UX Design"], "AWS Migration": ["Basis", "Integration"],
			"Carlsberg UX Support": ["UX Design"], "CR5": ["Functional", "Testing"], "CR6 Event Processing": ["Development", "Integration"], "Croda UX Support": ["UX Design"],
			"Maextro Croda - Material Extensions": ["Functional", "Development"], "Maextro PAD": ["Functional"], "NATS Timesheet Development": ["Development"], "Engineering CR3": ["Functional", "Testing"], "Maextro Material Master": ["Functional"]
		},
		projectExtras: {},
		projectOf: function (sId) { return preview.projectExtras[sId] || (preview.projectExtras[sId] = { team: [], att: [] }); },

		RTW_STEPS: ["Absence recorded and categorised", "Fit note received and filed", "Return-to-work conversation held", "Wellbeing support options discussed", "Outcome recorded and trigger reviewed"]
	};
	return preview;
});
