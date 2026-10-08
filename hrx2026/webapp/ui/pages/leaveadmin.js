/*
 * Leave management (managers): requests waiting on you (leaveToApprove, actionOnLeave)
 * and every leave request across the organisation (Leaves).
 */
sap.ui.define(["../core", "../service", "../data", "./leave"], function (hrx, svc, data, leave) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); };
	var pend = [], all = [], status = "";

	function render(el) {
		root = el;
		el.innerHTML = "<div class=\"card\" style=\"margin-bottom:var(--gap)\"><div class=\"card-head\"><div class=\"card-title\">Pending approvals</div><div class=\"card-hint\" id=\"lmCount\"></div></div><div id=\"lmPending\"></div></div>" +
			"<div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">Team leave</div><div class=\"card-hint\" id=\"lmHint\" style=\"margin-top:3px\"></div></div><div style=\"display:flex;gap:10px;align-items:center\"><div class=\"md-search\"><span class=\"si\">" + hrx.ICON.search + "</span><input id=\"lmSearch\" placeholder=\"Search employee\"></div><select id=\"lmStatus\" style=\"width:150px\"><option value=\"\">All statuses</option><option value=\"pending\">Requested</option><option value=\"approved\">Approved</option><option value=\"rejected\">Rejected</option></select></div></div><div id=\"lmTable\"></div></div>";
		$("lmSearch").addEventListener("input", paintAll);
		$("lmStatus").addEventListener("change", function (e) { status = e.target.value; paintAll(); });
		$("lmPending").addEventListener("click", function (e) {
			var btn = e.target.closest("button[data-act]"); if (!btn) { return; }
			var g = pend.find(function (x) { return x.id === btn.closest(".appr-row").dataset.id; });
			leave.decide(g, btn.dataset.act === "approve", btn);
		});
		hrx.on("pending", function () { if (root.classList.contains("on")) { load(); } });
		hrx.on("leave", function () { if (root.classList.contains("on")) { load(); } });
	}
	async function load() {
		$("lmPending").innerHTML = hrx.loading();
		$("lmTable").innerHTML = hrx.loading();
		var from = hrx.iso(hrx.addDays(hrx.today(), -365));
		try {
			await data.index();
			var r = await Promise.all([svc.leaveToApprove(), svc.Leaves.list({ $filter: "StartDate ge " + from, $expand: "EmpID($select=EmployeeID,FirstName,LastName),LeaveCategoryId($select=LeaveCategoryDesc),Status($select=ID,StatusDesc)", $orderby: "StartDate desc" })]);
			pend = data.groupLeaves(r[0]);
			all = data.groupLeaves(r[1]);
			$("lmCount").textContent = pend.length + " pending";
			$("lmPending").innerHTML = pend.length ? pend.map(function (g) {
				return "<div class=\"appr-row\" data-id=\"" + g.id + "\"><div class=\"a\">" + data.face(g.empId, g.name) + "</div><div class=\"appr-main\"><div class=\"appr-name\">" + hrx.esc(g.name) + "</div><div class=\"appr-meta\">" + g.label + "</div><div class=\"appr-meta\">" + hrx.esc(g.type) + " · " + g.duration + (g.comment ? " · “" + hrx.esc(g.comment) + "”" : "") + "</div></div><div class=\"appr-days\">" + g.days + " " + (g.days === 1 ? "day" : "days") + "</div><div class=\"appr-actions\"><button class=\"btn approve sm\" type=\"button\" data-act=\"approve\">" + hrx.ICON.check + "Approve</button><button class=\"btn reject sm\" type=\"button\" data-act=\"reject\">" + hrx.ICON.x + "Reject</button></div></div>";
			}).join("") : "<div class=\"appr-empty\">Nothing waiting for approval</div>";
			paintAll();
		} catch (e) { $("lmPending").innerHTML = hrx.failed(e); $("lmTable").innerHTML = ""; }
	}
	function paintAll() {
		var q = $("lmSearch").value.trim().toLowerCase();
		var rows = all.filter(function (l) { return (!q || l.name.toLowerCase().indexOf(q) !== -1) && (!status || l.status === status); });
		$("lmHint").textContent = rows.length + " requests in the last 12 months and ahead";
		$("lmTable").innerHTML = hrx.tbl([{ h: "Employee" }, { h: "Dates" }, { h: "Days", al: "center" }, { h: "Type" }, { h: "Approver" }, { h: "Status", al: "right" }], rows.map(function (l) {
			return ["<div class=\"person\"><span class=\"avatar-sm\">" + data.face(l.empId, l.name) + "</span><b>" + hrx.esc(l.name) + "</b></div>", l.label, l.days.toFixed(1), "<span class=\"dot\" style=\"background:" + (hrx.LTYPE_COLOR[l.type] || "var(--txt-3)") + "\"></span>" + hrx.esc(l.type) + "<span class=\"dur\">" + l.duration + "</span>", hrx.esc(data.userName(l.approver)), data.statusPill(l.status)];
		}), "No leave requests to show");
	}
	return { render: render, load: load };
});
