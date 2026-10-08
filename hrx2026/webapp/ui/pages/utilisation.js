/*
 * Utilisation (managers): billable against total days booked per person over a period,
 * from TimeLog and each project's type (internal projects are not billable).
 */
sap.ui.define(["../core", "../data", "../picker"], function (hrx, data, picker) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); }, per, rows = null;

	function render(el) {
		root = el;
		per = picker.period("ut", function () { load(); });
		el.innerHTML = "<div class=\"page-actions\"><span class=\"stamp\" id=\"utStamp\"></span><button class=\"btn primary\" id=\"utRefresh\" type=\"button\">" + hrx.ICON.refresh + "Refresh from service</button></div>" +
			"<div class=\"fbar\">" + per.html + "<div class=\"fg qlinks\" style=\"flex:0 0 auto;min-width:0\"><button class=\"btn ghost sm\" id=\"utYtd\" type=\"button\">This year</button><button class=\"btn ghost sm\" id=\"utLast\" type=\"button\">Last year</button></div><div class=\"fg\" style=\"max-width:240px;margin-left:auto\"><label>Show</label><select id=\"utShow\"><option value=\"all\">Everyone</option><option value=\"bill\">On billable work</option><option value=\"u50\">Under 50%</option><option value=\"u80\">Under 80%</option></select></div></div>" +
			"<div class=\"kpis\" id=\"utKpis\"></div><div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">Utilisation by person</div><div class=\"card-hint\" id=\"utSub\" style=\"margin-top:3px\"></div></div></div><div id=\"utTable\"></div></div>";
		per.init(el);
		$("utShow").addEventListener("change", paint);
		$("utYtd").addEventListener("click", function () { per.set("ytd"); });
		$("utLast").addEventListener("click", function () { per.set("last"); });
		el.querySelector("#utRefresh").addEventListener("click", function () { load().then(function () { hrx.toast("Utilisation refreshed from the timesheet service"); }); });
	}
	async function load() {
		$("utTable").innerHTML = hrx.loading();
		try { rows = await data.utilisation(per.from(), per.to()); hrx.root.querySelector("#utStamp").textContent = hrx.refreshStamp(); paint(); }
		catch (e) { $("utTable").innerHTML = hrx.failed(e); }
	}
	function paint() {
		if (!rows) { return; }
		var sh = $("utShow").value;
		var list = rows.map(function (u) { return Object.assign({ pct: u.total ? Math.round(u.billable / u.total * 100) : 0 }, u); })
			.filter(function (u) { return sh === "all" || (sh === "bill" && u.billable > 0) || (sh === "u50" && u.pct < 50) || (sh === "u80" && u.pct < 80); })
			.sort(function (a, b) { return b.pct - a.pct || a.name.localeCompare(b.name); });
		var tb = list.reduce(function (a, u) { return a + u.billable; }, 0), tt = list.reduce(function (a, u) { return a + u.total; }, 0), team = tt ? Math.round(tb / tt * 100) : 0, onBill = list.filter(function (u) { return u.billable > 0; }).length;
		$("utKpis").innerHTML = hrx.kpi(team ? hrx.utilState(team) : "neu", "ti-chart-bar", "Team utilisation", team, "%", "Weighted by days booked") + hrx.kpi("neu", "ti-briefcase", "On billable projects", onBill + " / " + list.length, "", "Of those who booked time") + hrx.kpi("ok", "ti-calendar-dollar", "Billable days", hrx.num(tb), "", "In the period") + hrx.kpi("neu", "ti-calendar-stats", "Total days booked", hrx.num(tt), "", "Billable and internal");
		$("utSub").textContent = list.length + " booked time in " + per.label();
		$("utTable").innerHTML = hrx.tbl([{ h: "Employee" }, { h: "Billable", al: "right" }, { h: "Total", al: "right" }, { h: "Utilisation" }, { h: "Billable projects" }], list.map(function (u) {
			var st = hrx.utilState(u.pct), n = u.projects.length;
			return ["<b>" + hrx.esc(u.name) + "</b><small class=\"tsub\">" + (n === 0 ? "No billable project" : n === 1 ? "1 billable project" : n + " billable projects") + "</small>", hrx.num(u.billable), hrx.num(u.total), hrx.bar(u.pct, st, u.pct + "%"), "<span class=\"projs\">" + (u.projects.map(hrx.esc).join(", ") || "—") + "</span>"];
		}), "Nobody booked time in this period");
	}
	return { render: render, load: function () { return rows ? paint() : load(); } };
});
