/*
 * Policies to read. The HRX service has no policy or acknowledgement entities yet, so
 * this page runs on the prototype's sample documents (see ../preview.js).
 */
sap.ui.define(["../core", "../preview"], function (hrx, preview) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); }, ME = preview.ME;
	var mine = function () { return preview.docs.filter(function (d) { return preview.audience(d).some(function (p) { return p.name === ME; }); }).sort(function (a, b) { return b.pub.localeCompare(a.pub); }); };
	var out = function (d) { return d.req && !d.ackBy.has(ME); };

	function render(el) {
		root = el;
		el.innerHTML = "<div class=\"alerts\">" + hrx.previewStrip("Policies and acknowledgements are sample documents.") + "</div>" +
			"<div class=\"kpis\" id=\"pdKpis\" style=\"grid-template-columns:repeat(3,1fr)\"></div>" +
			"<div class=\"card\"><div class=\"card-head\"><div><div class=\"card-title\">Policies &amp; documents</div><div class=\"card-hint\" style=\"margin-top:3px\">Open a document to read it, then acknowledge it</div></div><label class=\"chk\"><input type=\"checkbox\" id=\"pdOnly\"><span>Only those I have not acknowledged</span></label></div><div id=\"pdList\"></div></div>";
		$("pdOnly").addEventListener("change", load);
		$("pdList").addEventListener("click", function (e) {
			var b = e.target.closest("[data-act]"); if (!b) { return; }
			var d = preview.docs.find(function (x) { return x.id === b.closest(".doc-row").dataset.id; });
			if (b.dataset.act === "read") { readDoc(d); return; }
			d.ackBy.add(ME); hrx.toast(d.name + " acknowledged"); hrx.emit("docs");
		});
		hrx.on("docs", function () { if (root.classList.contains("on")) { load(); } });
	}
	function readDoc(d) { if (d.url) { hrx.openUrl(d.url); return; } hrx.toast("No file is attached to this sample document", "crit"); }
	function load() {
		var all = mine(), need = all.filter(function (d) { return d.req; }).length, outN = all.filter(out).length;
		$("pdKpis").innerHTML = hrx.kpi("neu", "ti-file-text", "Available to you", all.length, "", "Policies and documents") + hrx.kpi("neu", "ti-checklist", "Need acknowledgement", need, "", "Across all documents") + hrx.kpi(outN ? "warn" : "ok", "ti-alert-circle", "Outstanding", outN, "", outN ? "Waiting on you" : "All done");
		var rows = $("pdOnly").checked ? all.filter(out) : all;
		$("pdList").innerHTML = rows.length ? rows.map(function (d) {
			var status = !d.req ? "<span class=\"noack\">No acknowledgement needed</span>" : (out(d) ? hrx.pill("warn", "Not acknowledged") : hrx.pill("ok", "Acknowledged"));
			return "<div class=\"doc-row\" data-id=\"" + d.id + "\"><div class=\"doc-main\"><div class=\"doc-name\">" + hrx.esc(d.name) + "</div><div class=\"doc-meta\">" + d.cat + " · version " + d.ver + " · published " + hrx.fmt(d.pub) + "</div></div><div class=\"doc-status\">" + status + "</div><div class=\"doc-acts\"><button class=\"btn ghost sm\" type=\"button\" data-act=\"read\">" + hrx.ICON.eye + "Read</button>" + (out(d) ? "<button class=\"btn primary sm\" type=\"button\" data-act=\"ack\">" + hrx.ICON.check + "Acknowledge</button>" : "") + "</div></div>";
		}).join("") : hrx.empty("Nothing to acknowledge", "You have acknowledged every document that needs it.");
	}
	return { render: render, load: load, readDoc: readDoc };
});
