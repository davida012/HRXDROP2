/*
 * Timesheet reporting (managers). Everything here is worked out from TimeLog (time
 * booked in the period) and UserToProject (who is on what, at which day rate):
 * billing by assignment, billed days by customer and project, the
 * customer / project / resource breakdown, and who has booked this week.
 */
sap.ui.define(["../core", "../service", "../data", "../picker"], function (hrx, svc, data, picker) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); }, per;
	var COLORS = ["#26AAE2", "#756EE5", "#C43FF6", "#2DD4BF", "#E5B159", "#E5484D"];
	var st = { tab: "assign", cust: "", proj: "", res: "", q: "", work: "all", drill: null, sq: "", open: {}, brkOpen: {} };
	var model = { asg: [], logs: [], week: [], loaded: false };

	function render(el) {
		root = el;
		per = picker.period("tr", function () { load(); });
		el.innerHTML = "<div class=\"page-actions\"><span class=\"stamp\" id=\"trStamp\"></span><button class=\"btn primary\" id=\"trRefresh\" type=\"button\">" + hrx.ICON.refresh + "Refresh from service</button></div>" +
			"<div class=\"fbar\"><div class=\"fg\"><label>Customer</label><select id=\"trCust\"></select></div><div class=\"fg\"><label>Project</label><select id=\"trProj\"></select></div><div class=\"fg\"><label>Resource</label><select id=\"trRes\"></select></div>" + per.html + "<div class=\"fg qlinks\" style=\"flex:0 0 auto;min-width:0\"><button class=\"btn ghost sm\" id=\"trClear\" type=\"button\">Clear</button></div></div>" +
			hrx.tabsHtml([{ k: "assign", label: "Billing by assignment" }, { k: "days", label: "Billed days overview" }, { k: "break", label: "Timesheet breakdown" }, { k: "sub", label: "Who's submitted" }], "assign") +
			"<div id=\"trBody\"></div>";
		per.init(el);
		["trCust", "trProj", "trRes"].forEach(function (id) { $(id).addEventListener("change", function () { st.cust = $("trCust").value; st.proj = $("trProj").value; st.res = $("trRes").value; st.drill = null; paint(); }); });
		$("trClear").addEventListener("click", function () { st.cust = st.proj = st.res = st.q = st.sq = ""; st.work = "all"; st.drill = null; per.set("ytd"); });
		el.querySelector("#trRefresh").addEventListener("click", function () { load().then(function () { hrx.toast("Timesheet data refreshed from the service"); }); });
		el.querySelector(".tabs").addEventListener("click", function (e) { var t = e.target.closest(".tab"); if (!t) { return; } st.tab = t.dataset.tab; paint(); });
		$("trBody").addEventListener("input", function (e) {
			var id = e.target.id; if (["trQ", "trSQ"].indexOf(id) === -1) { return; }
			var pos = e.target.selectionStart; if (id === "trQ") { st.q = e.target.value; } else { st.sq = e.target.value; }
			paint(); var x = $(id); if (x) { x.focus(); x.setSelectionRange(pos, pos); }
		});
		$("trBody").addEventListener("change", function (e) { if (e.target.id === "trWork") { st.work = e.target.value; paint(); } });
		$("trBody").addEventListener("click", onClick);
		hrx.on("time", function () { model.loaded = false; });
	}
	async function load() {
		$("trBody").innerHTML = hrx.loading();
		var t = hrx.today(), mStart = hrx.iso(new Date(t.getFullYear(), t.getMonth(), 1));
		var from = per.from() < mStart ? per.from() : mStart, to = per.to() > hrx.iso(t) ? per.to() : hrx.iso(t);
		try {
			var r = await Promise.all([
				svc.UserToProject.list({ $expand: "Employee($select=EmployeeID,FirstName,LastName),Project($select=ID,ProjectDesc,ProjectType,PONumber,ClientID_ID),BillingID($select=BillingDesc)" }),
				svc.TimeLog.list({ $select: "ID,Employee_EmployeeID,Project_ID,Date,Hours,Comment", $filter: "Date ge " + from + " and Date le " + to, $orderby: "Date desc" }),
				data.weekCompliance(hrx.monday(t)),
				data.index()
			]);
			model.asg = r[0]; model.logs = r[1]; model.week = r[2]; model.loaded = true;
			hrx.root.querySelector("#trStamp").textContent = hrx.refreshStamp();
			paint();
		} catch (e) { $("trBody").innerHTML = "<div class=\"card\">" + hrx.failed(e) + "</div>"; }
	}

	// one booking per customer / project / resource, from the time logged in the period
	function bookings() {
		var ix = data._byId, from = per.from(), to = per.to(), by = {};
		model.logs.forEach(function (l) {
			if (l.Date < from || l.Date > to) { return; }
			var p = ix.project[l.Project_ID]; if (!p) { return; }
			var k = l.Employee_EmployeeID + "|" + l.Project_ID;
			var b = by[k] || (by[k] = { key: k, emp: l.Employee_EmployeeID, res: data.userName(l.Employee_EmployeeID), projId: p.ID, proj: p.ProjectDesc, cust: (ix.client[p.ClientID_ID] || {}).ClientName || "—", bill: data.isBillable(p), days: 0, logs: [] });
			b.days += hrx.mins(l.Hours) / 480; b.logs.push(l);
		});
		return Object.keys(by).map(function (k) { return by[k]; });
	}
	function filtered() { return bookings().filter(function (b) { return (!st.cust || b.cust === st.cust) && (!st.proj || b.proj === st.proj) && (!st.res || b.res === st.res); }); }
	function fill(all) {
		var uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }).sort(); };
		var opt = function (list, cur) { return "<option value=\"\">All</option>" + list.map(function (c) { return "<option" + (cur === c ? " selected" : "") + ">" + hrx.esc(c) + "</option>"; }).join(""); };
		var custs = uniq(all.map(function (b) { return b.cust; }));
		var projs = uniq(all.filter(function (b) { return !st.cust || b.cust === st.cust; }).map(function (b) { return b.proj; }));
		if (st.proj && projs.indexOf(st.proj) === -1) { st.proj = ""; }
		$("trCust").innerHTML = opt(custs, st.cust); $("trProj").innerHTML = opt(projs, st.proj); $("trRes").innerHTML = opt(uniq(all.map(function (b) { return b.res; })), st.res);
	}
	function paint() {
		if (!model.loaded) { load(); return; }
		fill(bookings());
		$("trBody").innerHTML = ({ assign: assign, days: days, "break": brk, sub: sub })[st.tab]();
		root.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("on", t.dataset.tab === st.tab); });
	}

	function assign() {
		var t = hrx.today(), mStart = hrx.iso(new Date(t.getFullYear(), t.getMonth(), 1)), month = hrx.MONTH_FULL[t.getMonth()] + " " + t.getFullYear();
		var rate = {}; model.asg.forEach(function (a) { rate[a.Employee_EmployeeID + "|" + a.Project_ID] = a; });
		var monthDays = {}; model.logs.forEach(function (l) { if (l.Date >= mStart) { var k = l.Employee_EmployeeID + "|" + l.Project_ID; monthDays[k] = (monthDays[k] || 0) + hrx.mins(l.Hours) / 480; } });
		var all = filtered().map(function (b) {
			var a = rate[b.key] || {}, r = b.bill ? parseFloat(a.DayRate) || 0 : null;
			return Object.assign({}, b, { rate: r, total: r != null ? b.days * r : null, month: r != null ? (monthDays[b.key] || 0) * r : null, po: (data._byId.project[b.projId] || {}).PONumber });
		});
		var q = st.q.toLowerCase();
		var list = all.filter(function (a) { return (st.work === "all" || (st.work === "bill" && a.bill) || (st.work === "int" && !a.bill)) && (!q || (a.cust + a.proj + a.res + a.logs.map(function (l) { return l.Comment; }).join(" ")).toLowerCase().indexOf(q) !== -1); })
			.sort(function (a, b) { return a.res.localeCompare(b.res) || a.proj.localeCompare(b.proj); });
		var billable = all.filter(function (a) { return a.bill; }), nLogs = list.reduce(function (n, a) { return n + a.logs.length; }, 0);
		var kp = hrx.kpi("neu", "ti-briefcase", "Billable assignments", billable.length, "", "of " + all.length + " assignments") + hrx.kpi("neu", "ti-building", "Clients", billable.map(function (a) { return a.cust; }).filter(function (v, i, x) { return x.indexOf(v) === i; }).length, "", "With billable work") +
			hrx.kpi("ok", "ti-currency-pound", "Billed to date", hrx.gbp(billable.reduce(function (s, a) { return s + a.total; }, 0), 0), "", "In the period") + hrx.kpi("neu", "ti-calendar-month", "Billed this month", hrx.gbp(billable.reduce(function (s, a) { return s + a.month; }, 0), 0), "", month);
		var allOpen = list.length && list.every(function (a) { return st.open[a.key]; });
		var body = list.map(function (a) {
			var o = !!st.open[a.key];
			var row = "<tr class=\"asg-row" + (o ? " open" : "") + "\" data-k=\"" + hrx.esc(a.key) + "\"><td class=\"c-chev\"><span class=\"chev\">" + hrx.ICON.chr + "</span></td><td><b>" + hrx.esc(a.res) + "</b><small class=\"tsub\">" + (a.logs.length ? a.logs.length + (a.logs.length === 1 ? " booking" : " bookings") : "No bookings") + "</small></td><td>" + hrx.esc(a.cust) + "<small class=\"tsub\">" + hrx.esc(a.proj) + " - " + (a.bill ? hrx.esc(a.po || "No PO") : "No PO") + "</small></td><td>" + (a.bill ? hrx.pill("ok", "Billable") : hrx.pill("neu", "Internal")) + "</td><td class=\"num\">" + (a.rate ? hrx.gbp(a.rate, 0) : "—") + "</td><td class=\"num\">" + (a.month != null ? hrx.gbp(a.month, 0) : "—") + "</td><td class=\"num\">" + (a.total != null ? "<b>" + hrx.gbp(a.total, 0) + "</b>" : "—") + "</td></tr>";
			var subr = o ? "<tr class=\"asg-sub\"><td></td><td colspan=\"6\">" + (a.logs.length ? hrx.tbl([{ h: "Date" }, { h: "Hours", al: "right" }, { h: "Nature of work" }], a.logs.slice().sort(function (x, y) { return y.Date.localeCompare(x.Date); }).map(function (w) { return [hrx.fmt(w.Date), hrx.hhmm(hrx.mins(w.Hours)), hrx.esc(w.Comment || "—")]; })) : hrx.empty("No time bookings recorded")) + "</td></tr>" : "";
			return row + subr;
		}).join("");
		return "<div class=\"kpis\">" + kp + "</div><div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">Billing by assignment</div><div class=\"card-hint\" style=\"margin-top:3px\">" + list.length + " assignments · " + nLogs + " time bookings</div></div><div style=\"display:flex;gap:10px;align-items:center\"><div class=\"md-search\"><span class=\"si\">" + hrx.ICON.search + "</span><input id=\"trQ\" value=\"" + hrx.esc(st.q) + "\" placeholder=\"Search assignments or work\"></div><select id=\"trWork\" style=\"width:150px\"><option value=\"all\">All work</option><option value=\"bill\"" + (st.work === "bill" ? " selected" : "") + ">Billable only</option><option value=\"int\"" + (st.work === "int" ? " selected" : "") + ">Internal only</option></select><button class=\"btn ghost sm\" id=\"trExpand\" type=\"button\">" + (allOpen ? "Collapse all" : "Expand all") + "</button></div></div>" +
			"<div class=\"tscroll\"><table class=\"asg\"><thead><tr><th class=\"c-chev\"></th><th>Employee</th><th>Project</th><th>Billing</th><th style=\"text-align:right\">Day rate</th><th style=\"text-align:right\">This month</th><th style=\"text-align:right\">Billed total</th></tr></thead><tbody>" + (body || "<tr><td colspan=\"7\" class=\"tbl-empty\">Nothing to report for these filters</td></tr>") + "</tbody></table></div></div>";
	}
	function donut(items, total, centre) {
		var C = 2 * Math.PI * 42, off = 0;
		var arcs = items.map(function (it, i) { var len = total ? it.value / total * C : 0; var s = "<circle class=\"seg\" data-i=\"" + i + "\" cx=\"50\" cy=\"50\" r=\"42\" fill=\"none\" stroke=\"" + it.color + "\" stroke-width=\"13\" stroke-dasharray=\"" + len + " " + (C - len) + "\" stroke-dashoffset=\"" + (-off) + "\" transform=\"rotate(-90 50 50)\"></circle>"; off += len; return s; }).join("");
		return "<svg viewBox=\"0 0 100 100\" class=\"donut\"><circle cx=\"50\" cy=\"50\" r=\"42\" fill=\"none\" stroke=\"var(--line-soft)\" stroke-width=\"13\"/>" + arcs + "<text x=\"50\" y=\"49\" text-anchor=\"middle\" class=\"d-n\">" + centre + "</text><text x=\"50\" y=\"62\" text-anchor=\"middle\" class=\"d-l\">DAYS</text></svg>";
	}
	function custItems(r) { var m = {}; r.forEach(function (b) { m[b.cust] = (m[b.cust] || 0) + b.days; }); return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; }).sort(function (a, b) { return b.value - a.value; }).map(function (x, i) { return Object.assign(x, { color: COLORS[i % 6] }); }); }
	function days() {
		var r = filtered(), tot = r.reduce(function (a, b) { return a + b.days; }, 0), bill = r.filter(function (b) { return b.bill; }).reduce(function (a, b) { return a + b.days; }, 0);
		var items, hint, title;
		if (st.drill) { var m = {}; r.filter(function (b) { return b.cust === st.drill; }).forEach(function (b) { m[b.proj] = (m[b.proj] || 0) + b.days; }); items = Object.keys(m).map(function (k, i) { return { label: k, value: m[k], color: COLORS[i % 6] }; }); title = "Projects at " + st.drill; hint = items.length === 1 ? "One project in this period" : items.length + " projects in this period"; }
		else { items = custItems(r); title = "Days booked by customer"; hint = "Click a segment to see that customer’s projects"; }
		var sum = items.reduce(function (a, x) { return a + x.value; }, 0), pm = {};
		r.forEach(function (b) { pm[b.proj] = (pm[b.proj] || 0) + b.days; });
		var top = Object.keys(pm).map(function (k) { return { k: k, v: pm[k] }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10), mx = top.length ? top[0].v : 1;
		return "<div class=\"days-grid\"><div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">" + hrx.esc(per.get().mode === "ytd" ? "Year to date" : per.label()) + "</div></div><div class=\"card-body--padded\">" +
			"<div class=\"stat\"><div class=\"l\">Total days booked</div><div class=\"v\">" + hrx.num(tot) + " <small>days</small></div></div><div class=\"stat\"><div class=\"l\">Billable days</div><div class=\"v\">" + hrx.num(bill) + " <small>days</small></div></div><div class=\"stat\"><div class=\"l\">Non-billable days</div><div class=\"v\">" + hrx.num(tot - bill) + " <small>days</small></div></div></div></div>" +
			"<div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">" + hrx.esc(title) + "</div><div class=\"card-hint\" style=\"margin-top:3px\">" + hrx.esc(hint) + "</div></div>" + (st.drill ? "<button class=\"btn ghost sm\" id=\"trAllCust\" type=\"button\">All customers</button>" : "") + "</div><div class=\"card-body--padded\">" +
			(items.length ? "<div class=\"donut-wrap\">" + donut(items, sum, hrx.num(sum, 0)) + "</div><div class=\"legend2\">" + items.map(function (it, i) { return "<div class=\"lg-row" + (st.drill ? "" : " click") + "\" data-i=\"" + i + "\"><span class=\"dot\" style=\"background:" + it.color + "\"></span><span class=\"lg-n\">" + hrx.esc(it.label) + "</span><b>" + hrx.num(it.value) + "</b></div>"; }).join("") + "</div>" : hrx.empty("Nothing booked in this period")) + "</div></div>" +
			"<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">Top 10 projects by days booked</div></div><div class=\"card-body--padded\">" + (top.length ? top.map(function (x) { return "<div class=\"top-row\"><div class=\"top-l\"><span>" + hrx.esc(x.k) + "</span><b>" + hrx.num(x.v) + "</b></div><div class=\"ub-track\"><div class=\"ub-fill\" style=\"width:" + (x.v / mx * 100) + "%;background:linear-gradient(90deg,var(--ice),#756EE5)\"></div></div></div>"; }).join("") : hrx.empty("Nothing booked in this period")) + "</div></div></div>";
	}
	function brk() {
		var r = filtered(), cols = r.map(function (b) { return b.res; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
		var cu = r.map(function (b) { return b.cust; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(), np = r.map(function (b) { return b.proj; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
		var cell = function (v) { return v ? hrx.num(v) : "–"; }, sum = function (list, res) { return list.filter(function (b) { return !res || b.res === res; }).reduce(function (a, b) { return a + b.days; }, 0); };
		var allOpen = cu.length && cu.every(function (c) { return st.brkOpen[c]; }), body = "";
		cu.forEach(function (c) {
			var cl = r.filter(function (b) { return b.cust === c; }), projs = cl.map(function (b) { return b.proj; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(), o = !!st.brkOpen[c];
			body += "<tr class=\"grp" + (o ? " open" : "") + "\" data-c=\"" + hrx.esc(c) + "\"><td><span class=\"chev\">" + hrx.ICON.chr + "</span>" + hrx.esc(c) + "<span class=\"grp-n\">" + projs.length + " " + (projs.length === 1 ? "project" : "projects") + "</span></td>" + cols.map(function (x) { return "<td class=\"num\">" + cell(sum(cl, x)) + "</td>"; }).join("") + "<td class=\"num\">" + hrx.num(sum(cl)) + "</td></tr>";
			if (o) { projs.forEach(function (pr) { var pl = cl.filter(function (b) { return b.proj === pr; }); body += "<tr><td class=\"indent\">" + hrx.esc(pr) + "</td>" + cols.map(function (x) { return "<td class=\"num\">" + cell(sum(pl, x)) + "</td>"; }).join("") + "<td class=\"num\">" + hrx.num(sum(pl)) + "</td></tr>"; }); }
		});
		return "<div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">Customer, project and resource</div><div class=\"card-hint\" style=\"margin-top:3px\">" + cu.length + " customers · " + np + " projects · " + cols.length + " resources</div></div>" + (cu.length ? "<button class=\"btn ghost sm\" id=\"trBrkExpand\" type=\"button\">" + (allOpen ? "Collapse all" : "Expand all") + "</button>" : "") + "</div>" +
			(r.length ? "<div class=\"tscroll\"><table class=\"brk\"><thead><tr><th>Customer / Project</th>" + cols.map(function (x) { return "<th style=\"text-align:right\">" + hrx.esc(x) + "</th>"; }).join("") + "<th style=\"text-align:right\">Totals</th></tr></thead><tbody>" + body + "<tr class=\"tot\"><td>Totals</td>" + cols.map(function (x) { return "<td class=\"num\">" + hrx.num(sum(r, x)) + "</td>"; }).join("") + "<td class=\"num\">" + hrx.num(sum(r)) + "</td></tr></tbody></table></div>" : hrx.empty("Nothing booked in this period")) + "</div>";
	}
	function sub() {
		var w = model.week, full = w.filter(function (x) { return x.state === "full"; }).length, track = w.filter(function (x) { return x.state === "track"; }).length, under = w.length - full - track, pct = data.complianceOf(w);
		var q = st.sq.toLowerCase(), list = w.filter(function (x) { return !q || x.name.toLowerCase().indexOf(q) !== -1; }).sort(function (a, b) { return (a.booked / (a.target || 1)) - (b.booked / (b.target || 1)) || a.name.localeCompare(b.name); });
		var label = { full: ["ok", "Fully booked"], track: ["info", "On track"], under: ["warn", "Under target"], none: ["crit", "Not started"] };
		return "<div class=\"kpis\">" + hrx.kpi(pct >= 90 ? "ok" : "crit", "ti-clipboard-check", "Compliance this week", pct, "%", "Booked or on track / headcount") + hrx.kpi(under ? "warn" : "ok", "ti-alert-triangle", "Behind", under, "", "Below the hours due so far") + hrx.kpi("ok", "ti-circle-check", "Fully booked", full, "", "Whole week logged") + hrx.kpi("neu", "ti-calendar-week", "On track", track, "", "Booked all hours due so far") + "</div>" +
			"<div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">All employees</div><div class=\"card-hint\" style=\"margin-top:3px\">" + w.length + " employees</div></div><div style=\"display:flex;gap:10px;align-items:center\"><div class=\"md-search\"><span class=\"si\">" + hrx.ICON.search + "</span><input id=\"trSQ\" value=\"" + hrx.esc(st.sq) + "\" placeholder=\"Search\"></div><button class=\"btn ghost sm\" id=\"trSync\" type=\"button\">Refresh from timesheet service</button><button class=\"btn primary sm\" id=\"trAll\" type=\"button\">Send all reminders</button></div></div>" +
			hrx.tbl([{ h: "Employee" }, { h: "This week" }, { h: "Reminder" }, { h: "Booked", al: "right" }], list.map(function (x) {
				var s = x.state === "full" || x.state === "track" ? "ok" : (x.state === "under" ? "warn" : "crit");
				return ["<div class=\"person\"><span class=\"avatar-sm\">" + data.face(x.id, x.name) + "</span><div><b>" + hrx.esc(x.name) + "</b><small>" + hrx.esc(data.siteName(x.site)) + "</small></div></div>",
					"<div class=\"ack-bar\" style=\"min-width:180px\"><div class=\"ack-txt\">" + hrx.hhmm(x.booked) + " of " + hrx.hhmm(x.target) + " hrs" + (x.state !== "full" ? " · " + hrx.hhmm(x.due) + " due so far" : "") + "</div>" + hrx.bar(x.target ? x.booked / x.target * 100 : 100, s) + "</div>",
					x.state === "full" || x.state === "track" ? "—" : "<button class=\"btn ghost sm\" type=\"button\" data-rem=\"" + x.id + "\">" + hrx.ICON.mail + "Remind</button>",
					hrx.pill(label[x.state][0], label[x.state][1])];
			}), "Nobody to show for this week") + "</div>";
	}
	function remindMail(aIds) {
		var emails = aIds.map(function (id) { return (data._byId.user[id] || {}).WorkEmail; }).filter(Boolean);
		var subject = "Timesheet reminder", body = "Hi,\n\nYour timesheet for this week is behind. Please log your time in HRX → My Timesheet.\n\nThanks";
		window.location.href = "mailto:" + (emails.length === 1 ? encodeURIComponent(emails[0]) : "") + "?" + (emails.length > 1 ? "bcc=" + encodeURIComponent(emails.join(",")) + "&" : "") + "subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
	}
	function onClick(e) {
		var gr = e.target.closest("table.brk tr.grp"); if (gr) { st.brkOpen[gr.dataset.c] = !st.brkOpen[gr.dataset.c]; paint(); return; }
		if (e.target.closest("#trBrkExpand")) { var cs = Array.prototype.map.call(root.querySelectorAll("table.brk tr.grp"), function (r) { return r.dataset.c; }), every = cs.every(function (c) { return st.brkOpen[c]; }); cs.forEach(function (c) { st.brkOpen[c] = !every; }); paint(); return; }
		var ar = e.target.closest(".asg-row"); if (ar) { st.open[ar.dataset.k] = !st.open[ar.dataset.k]; paint(); return; }
		if (e.target.closest("#trExpand")) { var ks = Array.prototype.map.call(root.querySelectorAll(".asg-row"), function (r) { return r.dataset.k; }), ev = ks.every(function (k) { return st.open[k]; }); ks.forEach(function (k) { st.open[k] = !ev; }); paint(); return; }
		var seg = e.target.closest(".donut .seg,.lg-row.click"); if (seg && !st.drill) { var it = custItems(filtered())[+seg.dataset.i]; if (it) { st.drill = it.label; paint(); } return; }
		if (e.target.closest("#trAllCust")) { st.drill = null; paint(); return; }
		var rem = e.target.closest("[data-rem]"); if (rem) { remindMail([rem.dataset.rem]); hrx.toast("Reminder opened in your mail app for " + data.userName(rem.dataset.rem)); return; }
		if (e.target.closest("#trAll")) {
			var behind = model.week.filter(function (x) { return x.state === "under" || x.state === "none"; });
			if (!behind.length) { hrx.toast("Everyone is on track — no reminders needed"); return; }
			remindMail(behind.map(function (x) { return x.id; })); hrx.toast("Reminder to " + behind.length + " employees opened in your mail app"); return;
		}
		if (e.target.closest("#trSync")) { data.weekCompliance(hrx.monday(hrx.today())).then(function (w) { model.week = w; paint(); hrx.toast("Timesheets refreshed — " + data.complianceOf(w) + "% booked or on track"); }); }
	}
	return { render: render, load: function () { if (!model.loaded) { return load(); } paint(); } };
});
