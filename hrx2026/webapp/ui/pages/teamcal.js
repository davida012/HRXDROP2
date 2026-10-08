/*
 * Team Calendar: who is away each day of the week, from fetchTeamCalendar. Filters by
 * person, site (Sites) and project (UserToProject). A manager can click a free day to
 * book leave for someone (createLeaveRequestForTeamCalendar).
 */
sap.ui.define(["../core", "../service", "../data"], function (hrx, svc, data) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); };
	var st = { offset: 0, users: [], sel: [], site: "all", project: "all", asg: [] };

	function render(el) {
		root = el;
		el.innerHTML = "<div class=\"tablecard\"><div class=\"ttop\" style=\"flex-wrap:wrap;gap:14px\">" +
			"<div class=\"week-nav\"><button class=\"icon-btn sm\" id=\"tcPrev\" type=\"button\" title=\"Previous week\"><i class=\"ti ti-chevron-left\"></i></button><div class=\"ttop-title\" id=\"tcWeekLabel\"></div><button class=\"icon-btn sm\" id=\"tcNext\" type=\"button\" title=\"Next week\"><i class=\"ti ti-chevron-right\"></i></button></div>" +
			"<div style=\"display:flex;align-items:center;gap:14px;flex-wrap:wrap\">" +
			"<div class=\"date-field\" id=\"resourceField\" style=\"position:relative;width:220px\"><input id=\"resourceInput\" placeholder=\"Select resource(s)\" readonly style=\"cursor:pointer\"><div class=\"date-popover\" id=\"resourcePopover\" style=\"width:260px;max-height:300px;overflow-y:auto;right:0;left:auto\"><div id=\"resourceList\"></div></div></div>" +
			"<div style=\"display:flex;align-items:center;gap:8px\"><label class=\"f\" style=\"margin:0;white-space:nowrap\">Site</label><select id=\"siteFilter\" style=\"width:140px\"><option value=\"all\">All sites</option></select></div>" +
			"<div style=\"display:flex;align-items:center;gap:8px\"><label class=\"f\" style=\"margin:0;display:flex;align-items:center;gap:6px;white-space:nowrap\">Filter by project<span class=\"pill warn\" style=\"text-transform:none;letter-spacing:0;font-weight:600\">Not in MVP</span></label><select id=\"projectFilter\" style=\"width:160px\"><option value=\"all\">All projects</option></select></div>" +
			"</div></div><div class=\"tc-grid\" id=\"tcGrid\"></div></div>";
		$("tcPrev").addEventListener("click", function () { st.offset--; load(); });
		$("tcNext").addEventListener("click", function () { st.offset++; load(); });
		$("siteFilter").addEventListener("change", function (e) { st.site = e.target.value; grid(); });
		$("projectFilter").addEventListener("change", function (e) { st.project = e.target.value; grid(); });
		var pop = $("resourcePopover");
		$("resourceInput").addEventListener("click", function (e) { e.stopPropagation(); pop.classList.toggle("open"); });
		document.addEventListener("click", function (e) { if (!$("resourceField").contains(e.target)) { pop.classList.remove("open"); } });
		$("resourceList").addEventListener("change", function () {
			st.sel = Array.prototype.map.call($("resourceList").querySelectorAll("input:checked"), function (c) { return c.value; });
			$("resourceInput").value = st.sel.length ? st.sel.length + " selected" : "";
			grid();
		});
		$("tcGrid").addEventListener("click", onCell);
		hrx.on("leave", function () { if (root.classList.contains("on")) { load(); } });
		hrx.on("pending", function () { if (root.classList.contains("on")) { load(); } });
	}
	function monday() { return hrx.addDays(hrx.monday(hrx.today()), st.offset * 7); }

	async function load() {
		var mon = monday();
		$("tcWeekLabel").textContent = hrx.weekLabel(mon);
		$("tcGrid").innerHTML = "<div style=\"grid-column:1/-1\">" + hrx.loading() + "</div>";
		try {
			var r = await Promise.all([svc.fetchTeamCalendar(hrx.iso(mon), hrx.iso(hrx.addDays(mon, 6))), data.sites(), data.projects(), svc.UserToProject.list({ $select: "Employee_EmployeeID,Project_ID,IsActive" }), data.users(), data.index()]);
			var active = {}; r[4].forEach(function (u) { active[u.EmployeeID] = u; });
			st.users = (r[0].users || []).filter(function (u) { return !active[u.EmpID] || active[u.EmpID].IsActive !== false; });
			st.asg = r[3];
			var cur = $("siteFilter").value;
			$("siteFilter").innerHTML = "<option value=\"all\">All sites</option>" + r[1].map(function (s) { return "<option value=\"" + s.ID + "\">" + hrx.esc(s.SiteDesc) + "</option>"; }).join("");
			$("siteFilter").value = cur || "all";
			var used = {}; r[3].forEach(function (a) { if (a.IsActive !== false) { used[a.Project_ID] = 1; } });
			var pcur = $("projectFilter").value;
			$("projectFilter").innerHTML = "<option value=\"all\">All projects</option>" + r[2].filter(function (p) { return used[p.ID] && p.IsActive !== false; }).map(function (p) { return "<option value=\"" + p.ID + "\">" + hrx.esc(p.ProjectDesc) + "</option>"; }).join("");
			$("projectFilter").value = pcur && used[pcur] ? pcur : "all";
			if (!$("resourceList").children.length) {
				$("resourceList").innerHTML = st.users.map(function (u) { return "<label class=\"res-row\"><input type=\"checkbox\" value=\"" + u.EmpID + "\"><span class=\"a\">" + hrx.initials(u.Name) + hrx.photo(data.photoUrl(u.Picid, u.Pic)) + "</span>" + hrx.esc(u.Name) + "</label>"; }).join("");
			}
			grid();
		} catch (e) { $("tcGrid").innerHTML = "<div style=\"grid-column:1/-1\">" + hrx.failed(e) + "</div>"; }
	}
	function chip(l) {
		if (l.LeaveID === "BANKHOLIDAY") { return "<span class=\"tc-leave\" style=\"background:var(--frost-2);color:var(--txt-2)\" title=\"Bank holiday\">" + hrx.esc(l.LeaveType) + "</span>"; }
		var c = hrx.LTYPE_COLOR[l.LeaveType], pend = l.StatusID === svc.STATUS.requested;
		var style = l.LeaveType === "Sick" ? "background:var(--signal-soft);color:#991b1b" : (c && l.LeaveType !== "Holiday" ? "background:color-mix(in srgb," + c + " 16%,#fff);color:var(--ink)" : "");
		if (pend) { style += ";outline:1px dashed currentColor;outline-offset:-1px;opacity:.85"; }
		return "<span class=\"tc-leave\"" + (style ? " style=\"" + style + "\"" : "") + " title=\"" + hrx.esc(l.LeaveType + (pend ? " — requested" : " — approved") + (l.RequesterComments ? ": " + l.RequesterComments : "")) + "\">" + hrx.esc(l.LeaveType) + (l.AbsenceType && l.AbsenceType !== "Full Day" ? " · " + l.AbsenceType : "") + "</span>";
	}
	function grid() {
		var mon = monday(), today = hrx.iso(hrx.today());
		var html = "<div class=\"tc-cell tc-head\">Team member</div>";
		for (var i = 0; i < 7; i++) { var d = hrx.addDays(mon, i); html += "<div class=\"tc-cell tc-head" + (hrx.iso(d) === today ? " today" : "") + "\" id=\"tch" + i + "\">" + hrx.DOW_ABBR[d.getDay()] + " " + d.getDate() + "</div>"; }
		var onProject = null;
		if (st.project !== "all") { onProject = {}; st.asg.forEach(function (a) { if (a.Project_ID === st.project && a.IsActive !== false) { onProject[a.Employee_EmployeeID] = 1; } }); }
		var list = st.users.filter(function (u) { return (!st.sel.length || st.sel.indexOf(u.EmpID) !== -1) && (st.site === "all" || u.SiteID === st.site) && (!onProject || onProject[u.EmpID]); });
		var mgr = data.isManager();
		list.forEach(function (u) {
			var p = data._byId.user[u.EmpID] || {};
			html += "<div class=\"tc-cell tc-person\" data-emp=\"" + u.EmpID + "\"><div class=\"a\">" + hrx.initials(u.Name) + hrx.photo(data.photoUrl(u.Picid, u.Pic)) + "</div><div><span class=\"pname\">" + hrx.esc(u.Name) + "</span><small class=\"tc-sub\">" + hrx.esc(data.userTypeLabel(p.UserType)) + " · " + hrx.esc(data.siteName(u.SiteID)) + "</small></div></div>";
			for (var i = 0; i < 7; i++) {
				var s = hrx.iso(hrx.addDays(mon, i)), ls = (u.Leave || []).filter(function (l) { return l.Date === s; });
				var free = !ls.length && i < 5 && mgr;
				html += "<div class=\"tc-cell" + (free ? " hrx-tc-free" : "") + "\" data-emp=\"" + u.EmpID + "\" data-d=\"" + s + "\"" + (free ? " title=\"Book leave for " + hrx.esc(u.Name) + "\"" : "") + ">" + ls.map(chip).join("") + "</div>";
			}
		});
		if (!list.length) { html += "<div class=\"tc-cell\" style=\"grid-column:1/-1;justify-content:center\">" + hrx.empty("Nobody matches these filters") + "</div>"; }
		$("tcGrid").innerHTML = html;
	}
	async function onCell(e) {
		var c = e.target.closest(".hrx-tc-free"); if (!c) { return; }
		var u = st.users.find(function (x) { return x.EmpID === c.dataset.emp; }), s = c.dataset.d;
		var types = await data.leaveTypes();
		hrx.modal({
			title: "Book leave — " + u.Name,
			body: "<p class=\"modal-p\" style=\"margin-bottom:12px\">" + hrx.DOW_FULL[hrx.parse(s).getDay()] + " " + hrx.fmt(s) + ". Leave you book here is approved straight away.</p>" +
				hrx.form([{ k: "type", label: "Leave type", type: "select", opts: types.map(function (t) { return [t.ID, t.LeaveCategoryDesc]; }), val: (types.find(function (t) { return t.LeaveCategoryDesc === "Holiday"; }) || {}).ID, span2: true },
					{ k: "dur", label: "Duration", type: "select", opts: [["FULL", "Full day"], ["AM", "Half day — AM"], ["PM", "Half day — PM"]], span2: true },
					{ k: "comment", label: "Comments", type: "textarea", ph: "Optional", span2: true }], 1),
			confirm: { text: "Book leave", cls: "primary" },
			onConfirm: async function (b) {
				var v = hrx.read(b), t = types.find(function (x) { return x.ID === v.type; });
				try {
					var ok = await svc.leaveDatesForTeamCalendar(s, s, u.EmpID);
					if (!ok || !(ok.dates || []).length) { hrx.toast(u.Name + " cannot take leave on that day — it is not a working day for them, or they already have leave.", "crit"); return false; }
					await svc.createLeaveRequestForTeamCalendar(data.leaveRows([s], { duration: v.dur, typeId: v.type, type: t.LeaveCategoryDesc, comment: v.comment, emp: u.EmpID }));
					hrx.toast(t.LeaveCategoryDesc + " booked for " + u.Name);
					hrx.emit("leave");
				} catch (err) { hrx.toast(hrx.errText(err), "crit"); return false; }
			}
		});
	}

	return { render: render, load: load };
});
