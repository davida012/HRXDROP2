/*
 * Documents (managers): publish documents and chase acknowledgements. The HRX service's
 * Documents entity only stores profile pictures and logos, so this page runs on the
 * prototype's sample documents (see ../preview.js).
 */
sap.ui.define(["../core", "../preview", "./mydocs"], function (hrx, preview, mydocs) {
	"use strict";

	var root, $ = function (id) { return root.querySelector("#" + id); };
	var sel = null, filter = "all";
	var FILTERS = [["all", "All"], ["attention", "Needs attention"], ["complete", "Complete"], ["none", "No acknowledgement needed"]];
	var outstanding = function (d) { return preview.audience(d).filter(function (p) { return !d.ackBy.has(p.name); }); };
	var matches = function (d, f) { return f === "all" || (f === "attention" && d.req && preview.ackPct(d) < 80) || (f === "complete" && d.req && preview.ackPct(d) >= 100) || (f === "none" && !d.req); };
	var ackCell = function (d) { return d.req ? "<div class=\"ack-mini\"><span class=\"ack-n\">" + d.ackBy.size + " / " + preview.audience(d).length + "</span>" + hrx.bar(preview.ackPct(d), preview.ackState(d)) + "</div>" : "<span class=\"noack\">No acknowledgement needed</span>"; };

	function render(el) {
		root = el;
		el.innerHTML = "<div class=\"page-actions\"><button class=\"btn primary\" id=\"docUpload\" type=\"button\">" + hrx.ICON.upload + "Upload document</button></div>" +
			"<div class=\"alerts\">" + hrx.previewStrip("Documents and acknowledgement rates are sample data.") + "<div id=\"docAlert\"></div></div>" +
			"<div class=\"doc-grid\"><div class=\"card doc-panel\"><div class=\"card-head\"><div class=\"card-title\">All documents</div><div class=\"card-hint\" id=\"docCount\"></div></div>" +
			"<div class=\"md-tools\"><div class=\"md-search\"><span class=\"si\">" + hrx.ICON.search + "</span><input id=\"docQ\" placeholder=\"Search documents\"></div><select id=\"docCat\" style=\"width:170px\"></select></div>" +
			"<div class=\"doc-filters\" id=\"docFilters\"></div><div class=\"doc-rows\" id=\"docList\"></div></div>" +
			"<div class=\"card doc-panel\"><div class=\"card-head\"><div class=\"card-title\">Who hasn't acknowledged</div><div class=\"card-hint\" id=\"docWho\"></div></div><div class=\"doc-rows\" id=\"docDetail\"></div></div></div>";
		$("docQ").addEventListener("input", load); $("docCat").addEventListener("change", load);
		$("docFilters").addEventListener("click", function (e) { var c = e.target.closest("[data-f]"); if (!c) { return; } filter = c.dataset.f; load(); });
		$("docList").addEventListener("click", function (e) {
			var row = e.target.closest(".doc-row2"); if (!row) { return; }
			var d = preview.docs.find(function (x) { return x.id === row.dataset.id; });
			if (e.target.closest("[data-act=\"remind\"]")) { remind(d); return; }
			sel = d.id; load();
		});
		$("docDetail").addEventListener("click", function (e) { if (e.target.closest("[data-act=\"remind2\"]")) { remind(preview.docs.find(function (x) { return x.id === sel; })); } });
		el.querySelector("#docUpload").addEventListener("click", upload);
		hrx.on("docs", function () { if (root.classList.contains("on")) { load(); } });
	}
	function load() {
		var all = preview.docs, low = preview.lowAckCount();
		$("docAlert").innerHTML = low ? hrx.alert("warn", hrx.ICON.tri, low === 1 ? "1 document has a low acknowledgement rate" : low + " documents have low acknowledgement rates") : "";
		$("docAlert").style.display = low ? "" : "none";
		var cats = all.map(function (d) { return d.cat; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(), cur = $("docCat").value || "";
		$("docCat").innerHTML = "<option value=\"\">All categories</option>" + cats.map(function (c) { return "<option" + (c === cur ? " selected" : "") + ">" + hrx.esc(c) + "</option>"; }).join("");
		$("docFilters").innerHTML = FILTERS.map(function (f) { return "<button type=\"button\" class=\"chip" + (filter === f[0] ? " on" : "") + "\" data-f=\"" + f[0] + "\">" + f[1] + "<span class=\"chip-n\">" + all.filter(function (d) { return matches(d, f[0]); }).length + "</span></button>"; }).join("");
		var q = $("docQ").value.trim().toLowerCase(), cat = $("docCat").value;
		var rows = all.filter(function (d) { return matches(d, filter) && (!cat || d.cat === cat) && (!q || d.name.toLowerCase().indexOf(q) !== -1); })
			.sort(function (a, b) { return (a.req === b.req ? 0 : a.req ? -1 : 1) || (a.req ? preview.ackPct(a) - preview.ackPct(b) : 0) || b.pub.localeCompare(a.pub); });
		$("docCount").textContent = rows.length === all.length ? all.length + " published" : rows.length + " of " + all.length + " documents";
		$("docList").innerHTML = rows.length ? rows.map(function (d) { return "<div class=\"doc-row2" + (sel === d.id ? " sel" : "") + "\" data-id=\"" + d.id + "\"><div class=\"doc-main\"><div class=\"doc-name\">" + hrx.esc(d.name) + "</div><div class=\"doc-meta\">" + d.cat + " · " + d.vis + " · Published " + hrx.fmt(d.pub) + "</div></div>" + ackCell(d) + "<div class=\"doc-act\">" + (d.req && outstanding(d).length ? "<button class=\"icon-btn sm\" type=\"button\" data-act=\"remind\" title=\"Remind outstanding\">" + hrx.ICON.mail + "</button>" : "") + "</div></div>"; }).join("") : hrx.empty("No documents match", "Try a different search or filter.");
		var d = preview.docs.find(function (x) { return x.id === sel; });
		if (!d) { $("docWho").textContent = ""; $("docDetail").innerHTML = hrx.empty("Select a document", "Pick a document on the left to see who has and hasn’t acknowledged it."); return; }
		$("docWho").textContent = d.name;
		var o = outstanding(d);
		$("docDetail").innerHTML = !d.req ? hrx.empty("No acknowledgement needed", "This document doesn’t need to be acknowledged.") : o.length ? "<div class=\"who-list\">" + o.map(function (p) { return "<div class=\"who-row\"><div class=\"person\"><span class=\"avatar-sm\">" + hrx.initials(p.name) + "</span><div><b>" + hrx.esc(p.name) + "</b><small>" + p.site + "</small></div></div></div>"; }).join("") + "</div><div class=\"who-foot\"><button class=\"btn primary sm\" type=\"button\" data-act=\"remind2\">" + hrx.ICON.mail + "Remind outstanding</button></div>" : hrx.empty("Everyone has acknowledged this document");
	}
	function remind(d) {
		var n = outstanding(d).length;
		if (!n) { hrx.toast("Everyone has acknowledged this document"); return; }
		hrx.toast("Preview only: a reminder would go to " + n + (n === 1 ? " employee" : " employees"));
	}
	function upload() {
		var specs = [{ k: "name", label: "Document name", req: true, span2: true }, { k: "cat", label: "Category", type: "select", opts: ["Policy", "Procedure", "Handbook", "Form", "Other"], val: "Policy" }, { k: "vis", label: "Visible to", type: "select", opts: ["All employees", "Oswestry", "Aurangabad"], val: "All employees" }, { k: "req", label: "Acknowledgement required?", type: "check", val: true, span2: true }, { k: "file", label: "File", type: "file", accept: ".pdf,.doc,.docx", req: true, span2: true, hint: "PDF or Word, up to 10 MB" }];
		hrx.modal({
			title: "Upload document", cls: "wide", confirm: { text: "Upload & publish", cls: "primary" }, body: hrx.previewStrip("") + hrx.form(specs),
			onConfirm: function (bd) {
				var v = hrx.read(bd);
				if (!v.name) { bd.querySelector("[data-k=\"name\"]").classList.add("err"); hrx.toast("Enter a document name before publishing", "crit"); return false; }
				if (!v.file) { bd.querySelector("[data-k=\"file\"]").classList.add("err"); hrx.toast("Choose a file before publishing — staff cannot acknowledge a document they cannot read", "crit"); return false; }
				if (v.file.size > 10 * 1024 * 1024) { hrx.toast("That file is larger than 10 MB. Please upload a smaller file.", "crit"); return false; }
				var d = { id: "u" + Date.now(), name: v.name, cat: v.cat, ver: "1.0", pub: hrx.iso(hrx.today()), vis: v.vis, req: v.req, ackBy: new Set(), url: URL.createObjectURL(v.file) };
				preview.docs.push(d); sel = d.id; filter = "all"; $("docQ").value = "";
				hrx.toast(d.name + " published (preview, this session only)");
				hrx.emit("docs");
			}
		});
	}
	return { render: render, load: load, readDoc: mydocs.readDoc };
});
