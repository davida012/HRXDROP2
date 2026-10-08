/*
 * My Timesheet: a week of time against each assignment, grouped by client. Reads come
 * from fetchAssignments (assignments plus the week's TimeLog entries) and
 * fetchUserDetails (targets, leave, bank holidays); saving goes through
 * saveTimesheetEntry and deleteTimesheetEntry.
 */
sap.ui.define(["../core", "../service", "../data"], function (hrx, svc, data) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); };
	var st = { offset: 0, asg: [], rows: [], cells: {}, det: null, collapsed: {} };

	/** "7.5", "7:30", "07:30", "7h30" -> minutes; 0 when empty or unreadable */
	function parseTime(s) {
		s = String(s || "").trim().toLowerCase().replace("h", ":").replace(/m$/, "");
		if (!s) { return 0; }
		if (/^\d+(\.\d+)?$/.test(s)) { return Math.round(parseFloat(s) * 60); }
		var m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
		return m ? (+m[1]) * 60 + (+m[2]) : NaN;
	}
	/** assignments that can take time today: project active and open for booking */
	function bookable(aAsg) {
		var today = hrx.iso(hrx.today());
		return aAsg.filter(function (a) { return a.IsTimeBookingAllowed !== false && a.PIsActive !== false && a.UIsActive !== false && (!a.PEndDate || a.PEndDate >= today); })
			.sort(function (a, b) { return (a.ClientDesc + a.ProjectDesc).localeCompare(b.ClientDesc + b.ProjectDesc); });
	}
	var pinKey = function () { return "hrxTsRows:" + data.me.EmployeeID; };
	function pinned() { try { return JSON.parse(localStorage.getItem(pinKey()) || "[]"); } catch (e) { return []; } }
	function setPinned(a) { try { localStorage.setItem(pinKey(), JSON.stringify(a)); } catch (e) { /* no storage */ } }

	function monday() { return hrx.addDays(hrx.monday(hrx.today()), st.offset * 7); }

	function render(el) {
		root = el;
		el.innerHTML = "<div class=\"kpis\" id=\"tsKpis\" style=\"grid-template-columns:repeat(3,1fr)\"></div>" +
			"<div class=\"tablecard\"><div class=\"ttop\"><div class=\"week-nav\"><button class=\"icon-btn sm\" id=\"weekPrev\" type=\"button\" title=\"Previous week\"><i class=\"ti ti-chevron-left\"></i></button><div class=\"ttop-title\" id=\"weekLabel\"></div><button class=\"icon-btn sm\" id=\"weekNext\" type=\"button\" title=\"Next week\"><i class=\"ti ti-chevron-right\"></i></button></div>" +
			"<div style=\"display:flex;gap:10px\"><button class=\"btn ghost\" id=\"addProjBtn\" type=\"button\">Add Project(s)</button><button class=\"btn ghost\" id=\"delProjBtn\" type=\"button\"><i class=\"ti ti-trash\" style=\"vertical-align:-2px;margin-right:5px\"></i>Delete Project(s)</button><button class=\"btn primary\" id=\"tsSaveBtn\" type=\"button\">Save</button></div></div>" +
			"<div class=\"hours-progress\"><div class=\"hp-track\"><div class=\"hp-fill\" id=\"hpFill\" style=\"width:0%\"></div></div><div class=\"hp-label\"><b id=\"hpNum\">00:00</b> of <span id=\"hpTarget\">40:00</span> hrs this week</div></div>" +
			"<div class=\"tscroll\"><table class=\"ts-table\"><thead><tr id=\"tsHead\"></tr></thead><tbody id=\"tsBody\"></tbody></table></div>" +
			"<div class=\"cmt-note\"><i class=\"ti ti-alert-circle\"></i>A comment is required whenever time is logged against a day — managers use these to see what you've worked on.</div></div>";
		$("weekPrev").addEventListener("click", function () { if (confirmLeave()) { st.offset--; load(); } });
		$("weekNext").addEventListener("click", function () { if (confirmLeave()) { st.offset++; load(); } });
		$("tsSaveBtn").addEventListener("click", save);
		$("addProjBtn").addEventListener("click", addProjects);
		$("delProjBtn").addEventListener("click", deleteProjects);
		var body = $("tsBody");
		body.addEventListener("click", function (e) {
			var g = e.target.closest("tr.group-row");
			if (g) { st.collapsed[g.dataset.group] = !st.collapsed[g.dataset.group]; renderGrid(); return; }
			var c = e.target.closest(".cmt-btn"); if (c) { editComment(c.dataset.p, c.dataset.d); }
		});
		body.addEventListener("change", function (e) {
			var i = e.target.closest("input[data-p]"); if (!i) { return; }
			var m = parseTime(i.value);
			if (isNaN(m) || m > 1440) { i.classList.add("err"); hrx.toast("Enter time as HH:MM, e.g. 07:30", "crit"); return; }
			i.classList.remove("err");
			var cell = cellOf(i.dataset.p, i.dataset.d);
			cell.mins = m; cell.dirty = true;
			i.value = hrx.hhmm(m);
			paintCell(i.dataset.p, i.dataset.d); progress();
		});
	}
	function confirmLeave() {
		var dirty = Object.keys(st.cells).some(function (k) { return st.cells[k].dirty; });
		return !dirty || window.confirm("You have unsaved time on this week. Leave it without saving?");
	}
	function cellOf(p, d) { var k = p + "|" + d; return st.cells[k] || (st.cells[k] = { entries: [], mins: 0, comment: "", dirty: false }); }

	async function load() {
		var mon = monday(), sMon = hrx.iso(mon), sSun = hrx.iso(hrx.addDays(mon, 6));
		var mStart = new Date(mon.getFullYear(), mon.getMonth(), 1), mEnd = new Date(mon.getFullYear(), mon.getMonth() + 1, 0);
		$("weekLabel").textContent = hrx.weekLabel(mon);
		$("tsBody").innerHTML = "<tr><td colspan=\"9\">" + hrx.loading() + "</td></tr>";
		try {
			var r = await Promise.all([svc.fetchAssignments(sMon, sSun), svc.fetchUserDetails(sMon, sSun), svc.fetchUserDetails(hrx.iso(mStart), hrx.iso(mEnd)), svc.fetchAssignments(hrx.iso(mStart), hrx.iso(mEnd))]);
			st.asg = r[0].Assignments || [];
			st.det = r[1];
			st.cells = {};
			st.asg.forEach(function (a) {
				(a.TimeLogEntries || []).forEach(function (t) {
					var c = cellOf(a.ProjectID, t.Date);
					c.entries.push(t); c.mins += hrx.mins(t.Hours); c.comment = c.comment || t.Comment || "";
				});
			});
			var withTime = st.asg.filter(function (a) { return (a.TimeLogEntries || []).length; }).map(function (a) { return a.ProjectID; });
			var ok = bookable(st.asg).map(function (a) { return a.ProjectID; });
			st.rows = withTime.concat(pinned().filter(function (p) { return ok.indexOf(p) !== -1 && withTime.indexOf(p) === -1; }));
			renderKpis(r[2], r[3], mon);
			renderGrid();
		} catch (e) {
			$("tsBody").innerHTML = "<tr><td colspan=\"9\">" + hrx.failed(e) + "</td></tr>";
		}
	}
	function renderKpis(oMonthDet, oMonthAsg, mon) {
		var target = (oMonthDet.Users && oMonthDet.Users.utilizationTargetDays) || 0;
		var billed = 0;
		(oMonthAsg.Assignments || []).forEach(function (a) { if (a.ProjectType !== "INT") { (a.TimeLogEntries || []).forEach(function (t) { billed += hrx.mins(t.Hours) / 480; }); } });
		var pct = target ? Math.round(billed / target * 100) : 0, month = hrx.MONTH_FULL[mon.getMonth()] + " " + mon.getFullYear();
		$("tsKpis").innerHTML = hrx.kpi("neu", "ti-target-arrow", "Target billable days", hrx.num(target), "", month) +
			hrx.kpi(billed >= target ? "ok" : "warn", "ti-clock-hour-4", "Actual billed days", hrx.num(billed), "", month) +
			hrx.kpi(hrx.utilState(pct), "ti-chart-bar", "Actual utilisation", pct, "%", month);
	}
	function dayInfo(d) {
		var s = hrx.iso(d), det = st.det || {};
		var bh = (det.BankHoliday || []).find(function (h) { return h.Date === s; });
		var lv = (det.Leaves || []).filter(function (l) { return l.StartDate === s; });
		return { bh: bh, leave: lv.length ? lv.map(function (l) { return (l.LeaveCategoryId && l.LeaveCategoryId.LeaveCategoryDesc) + (l.DayTime !== "Full Day" ? " " + l.DayTime : ""); }).join(", ") : "" };
	}
	function renderGrid() {
		var mon = monday();
		var head = "<th class=\"chk-col\"></th><th>Project</th>";
		for (var i = 0; i < 7; i++) {
			var d = hrx.addDays(mon, i), inf = dayInfo(d), tip = inf.bh ? inf.bh.HolidayDesc : inf.leave;
			head += "<th id=\"d" + i + "\"" + (tip ? " title=\"" + hrx.esc(tip) + "\"" : "") + ">" + hrx.DOW_ABBR[d.getDay()] + " " + d.getDate() + (tip ? " <span class=\"hrx-daytag" + (inf.bh ? " bh" : "") + "\">" + (inf.bh ? "BH" : "Leave") + "</span>" : "") + "</th>";
		}
		$("tsHead").innerHTML = head;
		var asg = st.rows.map(function (p) { return st.asg.find(function (a) { return a.ProjectID === p; }); }).filter(Boolean);
		if (!asg.length) {
			$("tsBody").innerHTML = "<tr><td colspan=\"9\">" + hrx.empty("No projects on this week yet", "Use Add Project(s) to pick the assignments you want to book time against.") + "</td></tr>";
			progress(); return;
		}
		var groups = {};
		asg.forEach(function (a) { (groups[a.ClientDesc || "Other"] = groups[a.ClientDesc || "Other"] || []).push(a); });
		var html = "";
		Object.keys(groups).sort().forEach(function (g) {
			var col = !!st.collapsed[g];
			html += "<tr class=\"group-row" + (col ? " collapsed" : "") + "\" data-group=\"" + hrx.esc(g) + "\"><td colspan=\"9\"><i class=\"ti ti-chevron-down group-toggle\"></i>" + hrx.esc(g) + "</td></tr>";
			groups[g].sort(function (a, b) { return a.ProjectDesc.localeCompare(b.ProjectDesc); }).forEach(function (a) {
				html += "<tr class=\"group-child" + (col ? " hidden" : "") + "\" data-group=\"" + hrx.esc(g) + "\"><td class=\"chk-col\"><input type=\"checkbox\" style=\"width:auto\" data-row=\"" + a.ProjectID + "\"></td><td class=\"proj-cell\">" + hrx.esc(a.ProjectDesc) + "<small class=\"tsub\">" + (a.ProjectType === "INT" ? "Internal" : "Billable") + (a.IsTimeBookingAllowed === false ? " · booking closed" : "") + "</small></td>";
				for (var i = 0; i < 7; i++) {
					var d = hrx.addDays(mon, i), s = hrx.iso(d), c = cellOf(a.ProjectID, s);
					var closed = a.IsTimeBookingAllowed === false || (a.PStartDate && s < a.PStartDate) || (a.PEndDate && s > a.PEndDate);
					var weekend = d.getDay() === 0 || d.getDay() === 6;
					if (weekend && !c.mins) {
						html += "<td class=\"mono\"><div class=\"te-cell\"><input value=\"\" placeholder=\"—\" data-p=\"" + a.ProjectID + "\" data-d=\"" + s + "\"" + (closed ? " disabled" : "") + "></div></td>";
					} else {
						html += "<td><div class=\"te-cell\"><input value=\"" + hrx.hhmm(c.mins) + "\" data-p=\"" + a.ProjectID + "\" data-d=\"" + s + "\"" + (closed ? " disabled title=\"This project is not open for booking on this day\"" : "") + ">" + cmtBtn(a.ProjectID, s, c) + "</div></td>";
					}
				}
				html += "</tr>";
			});
		});
		$("tsBody").innerHTML = html;
		progress();
	}
	function cmtBtn(p, s, c) {
		var cls = c.comment ? "has" : (c.mins ? "missing" : "");
		return "<button class=\"cmt-btn " + cls + "\" type=\"button\" data-p=\"" + p + "\" data-d=\"" + s + "\" title=\"" + hrx.esc(c.comment || (c.mins ? "Comment required" : "Add a comment")) + "\"><i class=\"ti ti-message-2\"></i></button>";
	}
	function paintCell(p, s) {
		var inp = $("tsBody").querySelector("input[data-p=\"" + p + "\"][data-d=\"" + s + "\"]"); if (!inp) { return; }
		var wrap = inp.parentElement, c = cellOf(p, s), old = wrap.querySelector(".cmt-btn");
		var tmp = document.createElement("div"); tmp.innerHTML = cmtBtn(p, s, c);
		if (old) { old.replaceWith(tmp.firstChild); } else { wrap.appendChild(tmp.firstChild); }
	}
	function progress() {
		var total = 0, mon = monday();
		st.rows.forEach(function (p) { for (var i = 0; i < 7; i++) { total += cellOf(p, hrx.iso(hrx.addDays(mon, i))).mins; } });
		var target = (parseFloat(st.det && st.det.Users && st.det.Users.targetHrsPerWeek) || 40) * 60;
		$("hpNum").textContent = hrx.hhmm(total);
		$("hpTarget").textContent = hrx.hhmm(target);
		var f = $("hpFill"); f.style.width = Math.min(100, target ? total / target * 100 : 0) + "%"; f.classList.toggle("over", total > target);
	}
	function editComment(p, s) {
		var c = cellOf(p, s), a = st.asg.find(function (x) { return x.ProjectID === p; });
		hrx.modal({
			title: "Comment — " + hrx.DOW_FULL[hrx.parse(s).getDay()] + " " + hrx.fmt(s), cls: "wide",
			body: "<p class=\"modal-p\" style=\"margin-bottom:12px\">" + hrx.esc(a.ClientDesc + " · " + a.ProjectDesc) + "</p><div class=\"fld\"><label class=\"f\">What did you work on?" + (c.mins ? "<span class=\"req\">*</span>" : "") + "</label><textarea id=\"cmtText\" rows=\"4\" maxlength=\"500\">" + hrx.esc(c.comment) + "</textarea></div>",
			confirm: { text: "Done", cls: "primary" },
			onConfirm: function (b) { c.comment = b.querySelector("#cmtText").value.trim(); c.dirty = true; paintCell(p, s); }
		});
	}
	async function save() {
		var me = data.me, saves = [], dels = [], missing = 0;
		Object.keys(st.cells).forEach(function (k) {
			var c = st.cells[k]; if (!c.dirty) { return; }
			var p = k.split("|")[0], d = k.split("|")[1];
			if (c.mins > 0) {
				if (!c.comment) { missing++; return; }
				var first = c.entries[0];
				saves.push(Object.assign(first ? { ID: first.ID } : {}, { Project_ID: p, Employee_EmployeeID: me.EmployeeID, Date: d, Hours: hrx.hhmm(c.mins) + ":00", Comment: c.comment }));
				c.entries.slice(1).forEach(function (t) { dels.push(t.ID); });
			} else { c.entries.forEach(function (t) { dels.push(t.ID); }); }
		});
		if (missing) { hrx.toast("Add a comment to every day you have logged time against (" + missing + " missing).", "crit"); return; }
		if (!saves.length && !dels.length) { hrx.toast("Nothing has changed on this week."); return; }
		var b = $("tsSaveBtn"); b.disabled = true; b.textContent = "Saving…";
		try {
			if (saves.length) { await svc.saveTimesheetEntry(saves); }
			if (dels.length) { await svc.deleteTimesheetEntry(dels); }
			hrx.toast("Timesheet saved");
			hrx.emit("time");
			await load();
		} catch (e) { hrx.toast(hrx.errText(e), "crit"); }
		finally { b.disabled = false; b.textContent = "Save"; }
	}
	function addProjects() {
		var avail = bookable(st.asg).filter(function (a) { return st.rows.indexOf(a.ProjectID) === -1; });
		if (!avail.length) { hrx.toast("Every project you are assigned to is already on this week.", "crit"); return; }
		hrx.modal({
			title: "Add project(s)", cls: "wide",
			body: "<p class=\"modal-p\" style=\"margin-bottom:10px\">Your active assignments that are open for booking.</p>" + avail.map(function (a) { return "<label class=\"res-row\"><input type=\"checkbox\" value=\"" + a.ProjectID + "\"><span><b>" + hrx.esc(a.ProjectDesc) + "</b><small class=\"tsub\">" + hrx.esc(a.ClientDesc) + " · " + (a.ProjectType === "INT" ? "Internal" : "Billable") + "</small></span></label>"; }).join(""),
			confirm: { text: "Add", cls: "primary" },
			onConfirm: function (b) {
				var ids = Array.prototype.map.call(b.querySelectorAll("input:checked"), function (i) { return i.value; });
				if (!ids.length) { hrx.toast("Select at least one project", "crit"); return false; }
				st.rows = st.rows.concat(ids);
				setPinned(pinned().concat(ids).filter(function (v, i, a) { return a.indexOf(v) === i; }));
				renderGrid();
			}
		});
	}
	function deleteProjects() {
		var ids = Array.prototype.map.call($("tsBody").querySelectorAll("input[data-row]:checked"), function (i) { return i.dataset.row; });
		if (!ids.length) { hrx.toast("Select one or more projects using the checkboxes first.", "crit"); return; }
		var mon = monday(), entries = [];
		ids.forEach(function (p) { for (var i = 0; i < 7; i++) { cellOf(p, hrx.iso(hrx.addDays(mon, i))).entries.forEach(function (t) { entries.push(t.ID); }); } });
		hrx.confirm("Delete project(s)", "Remove " + ids.length + " project(s) from this timesheet?" + (entries.length ? " The " + entries.length + " time " + (entries.length === 1 ? "entry" : "entries") + " already saved on them this week will be deleted." : ""), "Delete", async function () {
			try {
				if (entries.length) { await svc.deleteTimesheetEntry(entries); }
				setPinned(pinned().filter(function (p) { return ids.indexOf(p) === -1; }));
				st.rows = st.rows.filter(function (p) { return ids.indexOf(p) === -1; });
				hrx.toast(ids.length + " project(s) removed");
				hrx.emit("time");
				await load();
			} catch (e) { hrx.toast(hrx.errText(e), "crit"); return false; }
		});
	}

	return { render: render, load: load, bookable: bookable, parseTime: parseTime };
});
