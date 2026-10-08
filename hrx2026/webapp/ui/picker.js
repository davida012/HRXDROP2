/*
 * The prototype's date range picker: click a start date, then an end date. Used by
 * New Leave Request, Quick Leave, Record sickness and the reporting period filters.
 */
sap.ui.define(["./core"], function (hrx) {
	"use strict";

	/**
	 * Markup for a picker field.
	 * @param {string} p id prefix
	 * @param {string} [label] field label, omitted for a bare field
	 * @param {boolean} [req] marks the field mandatory
	 * @param {string} [ph] placeholder
	 * @returns {string} html
	 */
	function html(p, label, req, ph) {
		var field = "<div class=\"date-field\" id=\"" + p + "Field\" style=\"position:relative\"><input id=\"" + p + "Input\" readonly placeholder=\"" + hrx.esc(ph || "Click to select dates") + "\" style=\"cursor:pointer\"><div class=\"date-popover\" id=\"" + p + "Pop\"><div class=\"dp-head\"><button class=\"dp-nav\" id=\"" + p + "Prev\" type=\"button\">" + hrx.ICON.chl + "</button><div class=\"dp-title\" id=\"" + p + "Title\"></div><button class=\"dp-nav\" id=\"" + p + "Next\" type=\"button\">" + hrx.ICON.chr + "</button></div><div class=\"dp-grid\" id=\"" + p + "Grid\"></div><div class=\"dp-foot\" id=\"" + p + "Foot\">Select a start date</div></div></div>";
		if (label === undefined) { return field; }
		return "<label class=\"f\">" + hrx.esc(label) + (req ? "<span class=\"req\">*</span>" : "") + "</label>" + field;
	}

	function fmtRange(a, b) {
		var M = hrx.MONTH_FULL, o = hrx.ordinal;
		if (a.getTime() === b.getTime()) { return o(a.getDate()) + " " + M[a.getMonth()] + " " + a.getFullYear(); }
		if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) { return o(a.getDate()) + " - " + o(b.getDate()) + " " + M[a.getMonth()] + " " + a.getFullYear(); }
		if (a.getFullYear() === b.getFullYear()) { return o(a.getDate()) + " " + M[a.getMonth()] + " - " + o(b.getDate()) + " " + M[b.getMonth()] + " " + a.getFullYear(); }
		return o(a.getDate()) + " " + M[a.getMonth()] + " " + a.getFullYear() + " - " + o(b.getDate()) + " " + M[b.getMonth()] + " " + b.getFullYear();
	}

	/**
	 * Wires a picker rendered with html(p) inside root.
	 * @param {HTMLElement} root element the picker markup lives in
	 * @param {string} p id prefix
	 * @param {object} [opts] allowPast, onPick(range)
	 * @returns {object} getRange(), reset(), setLabel(text)
	 */
	function make(root, p, opts) {
		opts = opts || {};
		var $ = function (s) { return root.querySelector("#" + p + s); };
		var input = $("Input"), field = $("Field"), pop = $("Pop"), grid = $("Grid"), title = $("Title"), foot = $("Foot");
		if (!input) { return null; }
		var TODAY = hrx.today();
		var viewMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), start = null, end = null, final = null;
		var same = function (a, b) { return a && b && a.getTime() === b.getTime(); };

		function render() {
			title.textContent = hrx.MONTH_FULL[viewMonth.getMonth()] + " " + viewMonth.getFullYear();
			var h = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(function (d) { return "<div class=\"dp-dow\">" + d + "</div>"; }).join("");
			var first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
			var g0 = hrx.addDays(first, -((first.getDay() + 6) % 7));
			for (var i = 0; i < 42; i++) {
				var d = hrx.addDays(g0, i), cls = "dp-day";
				if (d.getMonth() !== viewMonth.getMonth()) { cls += " muted"; }
				var dis = d < TODAY && !opts.allowPast;
				if (dis) { cls += " disabled"; }
				if (same(d, start)) { cls += " range-start"; }
				if (same(d, end)) { cls += " range-end"; }
				if (start && end && d > start && d < end) { cls += " in-range"; }
				h += "<div class=\"" + cls + "\" data-d=\"" + hrx.iso(d) + "\"" + (dis ? " title=\"You can't book leave for a date in the past\"" : "") + ">" + d.getDate() + "</div>";
			}
			grid.innerHTML = h;
		}
		function pick(d) {
			if (!start || end) { start = d; end = null; foot.textContent = "Now pick an end date"; render(); return; }
			if (d < start) { end = start; start = d; } else { end = d; }
			input.value = fmtRange(start, end);
			final = { start: new Date(start), end: new Date(end) };
			if (opts.onPick) { opts.onPick(final); }
			render();
			setTimeout(close, 150);
		}
		function open() { pop.classList.add("open"); var b = start || TODAY; viewMonth = new Date(b.getFullYear(), b.getMonth(), 1); foot.textContent = start && !end ? "Now pick an end date" : "Select a start date"; render(); }
		function close() { pop.classList.remove("open"); }

		input.addEventListener("click", function (e) { e.stopPropagation(); if (pop.classList.contains("open")) { close(); } else { open(); } });
		grid.addEventListener("click", function (e) { var c = e.target.closest(".dp-day:not(.disabled)"); if (!c) { return; } e.stopPropagation(); pick(hrx.parse(c.dataset.d)); });
		$("Prev").addEventListener("click", function (e) { e.stopPropagation(); viewMonth.setMonth(viewMonth.getMonth() - 1); render(); });
		$("Next").addEventListener("click", function (e) { e.stopPropagation(); viewMonth.setMonth(viewMonth.getMonth() + 1); render(); });
		document.addEventListener("click", function (e) { if (!field.contains(e.target)) { close(); } });

		return {
			getRange: function () { return final; },
			reset: function () { start = end = final = null; input.value = ""; },
			setLabel: function (t) { input.value = t; }
		};
	}

	/**
	 * The reporting period filter: year to date by default, last year, or any range.
	 * @param {string} p id prefix
	 * @param {function} onChange called with the period after every change
	 * @returns {object} html, init(root), set(mode), get(), label()
	 */
	function period(p, onChange) {
		var NOW = hrx.today(), YTD0 = new Date(NOW.getFullYear(), 0, 1);
		var cur = { mode: "ytd", start: YTD0, end: NOW }, pk = null, root = null;
		var lab = function () { return hrx.rangeLabel(cur.start, cur.end); };
		return {
			html: "<div class=\"fg\"><label>Period</label>" + html(p, undefined, false, "All dates") + "</div>",
			init: function (r) {
				root = r;
				pk = make(r, p, { allowPast: true, onPick: function (x) { cur = { mode: "custom", start: x.start, end: x.end }; r.querySelector("#" + p + "Input").value = lab(); onChange(cur); } });
				r.querySelector("#" + p + "Input").value = lab();
			},
			set: function (mode) {
				cur = mode === "last" ? { mode: mode, start: new Date(NOW.getFullYear() - 1, 0, 1), end: new Date(NOW.getFullYear() - 1, 11, 31) } : { mode: "ytd", start: YTD0, end: NOW };
				if (pk) { pk.reset(); }
				root.querySelector("#" + p + "Input").value = lab();
				onChange(cur);
			},
			get: function () { return cur; },
			from: function () { return hrx.iso(cur.start); },
			to: function () { return hrx.iso(cur.end); },
			label: lab
		};
	}

	return { html: html, make: make, fmtRange: fmtRange, period: period };
});
