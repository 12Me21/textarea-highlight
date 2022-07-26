function get_last_indent(str, end) {
	let start
	for (start=end-1; start>=0 && str[start]!="\n"; start--)
		if (str[start]!=" " && str[start]!="\t")
			end = start
	return [start+1, end]
}
function capture_tab(input, state) {
	input.dataset.capture_tab = state ? "yes" : ""
}
let indent_level = "\t" // or "    ", etc.
let events = {
	onclick(ev) { capture_tab(ev.target, true) },
	onfocus(ev) { capture_tab(ev.target, false) },
	onblur(ev) { capture_tab(ev.target, false) },
	onkeydown(ev) {
		if ('Tab'==ev.key && !ev.shiftKey && ev.target.dataset.capture_tab) {
			ev.preventDefault()
			document.execCommand('insertText', false, indent_level)
		}
	},
	onbeforeinput(ev) {
		if (ev.isComposing)
			return
		let el = ev.target
		capture_tab(el, true)
		if ('insertLineBreak'==ev.inputType) {
			let txt = el.value
			let [start, end] = get_last_indent(txt, el.selectionStart)
			let line = txt.substring(end, el.selectionStart)
			let open = /^[a-z]+ \(.*\)$|[{\[(]$/.test(line)
			if (end > start || open) {
				ev.preventDefault()
				let indent = txt.substring(start, end)
				if (open)
					indent += indent_level
				document.execCommand('insertText', false, "\n"+indent)
			}
		} else if ('insertText'==ev.inputType) {
			if (/^[}\])]$/.test(ev.data) {
				let [start, end] = get_last_indent(el.value, el.selectionStart)
				if (end==el.selectionStart)
					el.selectionStart -= indent_level.length
			}
		}
	},
}

function setup_textarea(input) {
	Object.assign(input, events)
}
