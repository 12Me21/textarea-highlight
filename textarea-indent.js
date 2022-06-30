function get_last_indent(str, end) {
	let start
	for (start=end-1; start>=0 && str[start]!="\n"; start--)
		if (str[start]!=" " && str[start]!="\t")
			end = start
	return str.substring(start+1, end)
}
function capture_tab(input, state) {
	input.dataset.capture_tab = state ? "yes" : ""
}
function setup_textarea(input, cb) {
	Object.assign(input, {
		onclick(e) { capture_tab(e.target, true) },
		onfocus(e) { capture_tab(e.target, false) },
		onblur(e) { capture_tab(e.target, false) },
		onkeydown(e) {
			if ('Tab'==e.key && !e.shiftKey && e.target.dataset.capture_tab) {
				cb && cb()
				e.preventDefault()
				document.execCommand('insertText', false, "\t")
			}
		},
		onbeforeinput(e) {
			cb && cb()
			capture_tab(e.target, true)
			if ('insertLineBreak'==e.inputType) {
				let indent = get_last_indent(e.target.value, e.target.selectionStart)
				if (indent) {
					e.preventDefault()
					document.execCommand('insertText', false, "\n"+indent)
				}
			}
		}
	})
}
