function pre(text, cls) {
	let p = document.createElement('span')
	if (cls)
		p.className = cls
	p.append(text)
	return p
}

class Parser {
	constructor(states) {
		this.lastIndex = 0
		this.text = ""
		this.states = Object.create(null)
		for (let [name, patterns] of Object.entries(states)) {
			let groups = []
			let r = patterns.join("|")
				.replace(/\n/g, "|").replace(/\\`/g, "`")
				.replace(/[(](?![?])/g, "(?:")
				.replace(/[(][?]<(.*?)_(.*?)>[)]/g, (m, name, state)=>{
					groups.push([name, state])
					return "()"
				})
			let regex = new RegExp(r, 'g')
			this.states[name] = {regex, groups}
		}
	}
	parse(text, out) {
		out.textContent = ""
		let current = 'data'
		let prev = -1
		let iloop = 0
		let lastIndex = 0
		while (1) {
			if (lastIndex==prev) {
				iloop++
				if (iloop>5)
					throw new Error('infinite loop '+lastIndex+"\n"+text.substring(lastIndex-10, 100))
			} else
				iloop=0
			prev = lastIndex
			let st = this.states[current]
			st.regex.lastIndex = lastIndex
			let match = st.regex.exec(text)
			if (!match)
				break
			let before = text.substring(lastIndex, match.index)
			lastIndex = st.regex.lastIndex
			let num = match.indexOf("", 1)-1
			let g = st.groups[num]
			if (before)
				out.append(pre(before))
			out.append(pre(match[0], g[0]))
			if (g[1])
				current = g[1]
		}
		let after = text.substring(lastIndex)
		if (after)
			out.append(pre(after))
	}
}

let htmlp = new Parser({
	data: [
		`&([a-zA-Z0-9]+|#[xX][0-9a-fA-F]+|#[0-9]+);?(?<charref_>)`,
		`<![dD][oO][cC][tT][yY][pP][eE][^]*?(>|$)(?<doctype_>)`,
		`<script>(?<tag_script>)`,
		`<style>(?<tag_rawtext>)`,
		`</?[a-z][^\t\n\f />]*/?(>(?<tag_>))?(?<tag_attributes>)`,
		`<!---?>(?<error_>)`,
		`<!--(?<comment_comment>)`,
		`<[!?/][^>]*(>|$)(?<error_>)`,
	],
	comment: [
		`[^]*?(?=--!?>|$)(?<commenttext_commentend>)`,
	],
	commentend: [
		`--!?>(?<comment_data>)`,
	],
	script: [
		`[^]*?(?=</script|$)(?<script_data>)`,
	],
	attributes: [
		`[^\t\n\f />=]+(?<key_aftername>)`,
		`>(?<tag_data>)`,
	],
	aftername: [
		`\s*=\s*(?<_value>)`,
		`(?<_attributes>)`,
	],
	value: [
		`[^\t\n\f >]*(?<value_attributes>)`,
		`(?<_attributes>)`,
	],
	rawtext: [
		`[^]*?(?=</style|$)(?<rawtext_data>)`,
	],
})
