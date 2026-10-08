/*
 * The prototype's master / detail layout used by Manage Resources, Clients and Projects:
 * a searchable list on the left, the selected record's tabs on the right.
 */
sap.ui.define(["./core"], function (hrx) {
	"use strict";

	return function (root, cfg) {
		var st = { sel: null, tab: cfg.tabs[0].k, q: "", full: false, f: cfg.f0 || {} };
		root.innerHTML = "<div class=\"md\"><div class=\"card md-list\"><div class=\"card-head\"><div class=\"card-title\" data-r=\"title\"></div></div><div class=\"md-tools\"><div class=\"md-search\"><span class=\"si\">" + hrx.ICON.search + "</span><input data-r=\"q\" placeholder=\"" + hrx.esc(cfg.searchPh) + "\"></div>" +
			(cfg.onFilter ? "<button class=\"icon-btn sm\" type=\"button\" data-t=\"filter\" title=\"" + hrx.esc(cfg.filterTip || "Filter") + "\">" + hrx.ICON.filter + "</button>" : "") +
			"<button class=\"icon-btn sm\" type=\"button\" data-t=\"add\" title=\"" + hrx.esc(cfg.addTip) + "\">" + hrx.ICON.plus + "</button><button class=\"icon-btn sm\" type=\"button\" data-t=\"refresh\" title=\"Reload from the HRX service\">" + hrx.ICON.refresh + "</button></div><div class=\"md-rows\" data-r=\"rows\"></div></div><div class=\"card md-detail\" data-r=\"detail\"></div></div>";
		var R = function (k) { return root.querySelector("[data-r=\"" + k + "\"]"); }, md = root.querySelector(".md");
		var find = function () { return cfg.items().find(function (i) { return cfg.key(i) === st.sel; }); };
		var visible = function () { return cfg.items().filter(function (i) { return (!st.q || cfg.search(i).toLowerCase().indexOf(st.q.toLowerCase()) !== -1) && (!cfg.pass || cfg.pass(i, st.f)); }); };
		var api;
		function list() {
			var v = visible(); R("title").textContent = cfg.title + " (" + v.length + ")";
			R("rows").innerHTML = v.length ? v.map(function (i) { return "<div class=\"md-row" + (cfg.key(i) === st.sel ? " sel" : "") + "\" data-k=\"" + hrx.esc(cfg.key(i)) + "\">" + cfg.row(i) + "</div>"; }).join("") : hrx.empty(cfg.emptyList);
		}
		function detail() {
			var it = find(); md.classList.toggle("open", !!it); md.classList.toggle("full", !!it && st.full);
			var d = R("detail"); if (!it) { d.innerHTML = ""; return; }
			var tab = cfg.tabs.find(function (t) { return t.k === st.tab; }) || cfg.tabs[0];
			d.innerHTML = "<div class=\"md-head\">" + cfg.head(it) + "<div class=\"acts\"><button class=\"icon-btn sm\" type=\"button\" data-t=\"full\" title=\"Toggle full screen\">" + hrx.ICON.expand + "</button><button class=\"icon-btn sm\" type=\"button\" data-t=\"close\" title=\"Close\">" + hrx.ICON.x + "</button></div></div><div class=\"md-tabs\">" + hrx.tabsHtml(cfg.tabs, tab.k) + "</div><div class=\"md-body\" data-r=\"body\"></div>" + (cfg.footer ? cfg.footer(it, tab.k) : "");
			var out = tab.render(it, R("body"));
			if (typeof out === "string") { R("body").innerHTML = out; }
			else if (out && typeof out.then === "function") {
				R("body").innerHTML = hrx.loading();
				var sel = st.sel, tk = tab.k;
				out.then(function (h) { if (st.sel === sel && st.tab === tk && typeof h === "string") { R("body").innerHTML = h; } }, function (e) { if (st.sel === sel) { R("body").innerHTML = hrx.failed(e); } });
			}
		}
		api = { st: st, list: list, detail: detail, refresh: function () { list(); detail(); }, body: function () { return R("body"); }, select: function (k) { st.sel = k; st.tab = cfg.tabs[0].k; api.refresh(); } };
		root.addEventListener("click", function (e) {
			var t = e.target.closest("[data-t]");
			if (t) {
				var a = t.dataset.t;
				if (a === "close") { st.sel = null; st.full = false; api.refresh(); }
				else if (a === "full") { st.full = !st.full; detail(); }
				else if (a === "add") { cfg.onAdd(api); }
				else if (a === "filter") { cfg.onFilter(st, api); }
				else if (a === "refresh") { R("rows").innerHTML = hrx.loading(); Promise.resolve(cfg.reload()).then(function () { api.refresh(); hrx.toast(cfg.title + " reloaded"); }, function (err) { R("rows").innerHTML = hrx.failed(err); }); }
				return;
			}
			var row = e.target.closest(".md-row"); if (row) { api.select(row.dataset.k); return; }
			var tab = e.target.closest(".tab"); if (tab) { st.tab = tab.dataset.tab; detail(); return; }
			var chip = e.target.closest(".chip"); if (chip && !chip.disabled) { chip.classList.toggle("on"); return; }
			var act = e.target.closest("[data-act]"); if (act && cfg.act) { cfg.act(act.dataset.act, find(), act, api, st.tab); }
		});
		root.addEventListener("input", function (e) { if (e.target.dataset.r === "q") { st.q = e.target.value; list(); } });
		return api;
	};
});
