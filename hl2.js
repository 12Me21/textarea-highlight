class State extends RegExp {
	constructor(parent, ...patterns) {
		let groups = []
		let r = patterns.join("|")
			.replace(/\n/g, "|").replace(/\\`/g, "`")
			.replace(/[(](?![?])/g, "(?:")
			.replace(/[(][?]<(.*?)_(.*?)>[)]/g, (m, name, state)=>{
				groups.push([name, state])
				return "()"
			})
		super(r, 'g')
		this.groups = groups
		this.parent = parent
	}
	scan() {
		this.lastIndex = this.parent.lastIndex
		let match = this.exec(this.parent.text)
		if (match) {
			let before = this.parent.text.substring(this.parent.lastIndex, match.index)
			this.parent.lastIndex = this.lastIndex
			let num = match.indexOf("", 1)-1
			return [before, this.groups[num], match[0]]
		}
	}
}

let parent = {lastIndex: 0, text: "<!doctype html> hii!~ <!--  hecko --> ... &lt;"}

let states = {
	data: new State(
		parent,
		`&([a-zA-Z0-9]+|#[xX][0-9a-fA-F]+|#[0-9]+);?(?<charref_>)`,
		`<![dD][oO][cC][tT][yY][pP][eE][^]*?(>|$)(?<doctype_>)`,
		`<script>(?<tag_script>)`,
		`<style>(?<tag_rawtext>)`,
		`</?[a-z][^\t\n\f />]*/?(>(?<tag_>))?(?<tag_attributes>)`,
		`<!---?>(?<error_>)`,
		`<!--(?<comment_comment>)`,
		`<[!?/][^>]*(>|$)(?<error_>)`,
	),
	comment: new State(
		parent,
		`[^]*?(?=--!?>|$)(?<commenttext_commentend>)`,
	),
	commentend: new State(
		parent,
		`--!?>(?<comment_data>)`,
	),
	script: new State(
		parent,
		`[^]*?(?=</script|$)(?<script_data>)`,
	),
	attributes: new State(
		parent,
		`[^\t\n\f />=]+(?<key_aftername>)`,
		`>(?<tag_data>)`,
	),
	aftername: new State(
		parent,
		`\s*=\s*(?<_value>)`,
		`(?<_attributes>)`,
	),
	value: new State(
		parent,
		`[^\t\n\f >]*(?<value_attributes>)`,
		`(?<_attributes>)`,
	),
	rawtext: new State(
		parent,
		`[^]*?(?=</style|$)(?<rawtext_data>)`,
	)
}
$in.oninput = e=>{
	go($in.value)
}

function pre(text, cls) {
	let p = document.createElement('span')
	if (cls)
		p.className = cls
	p.append(text)
	return p
}
function go(text) {
	$out.textContent = ""
	let current = 'data'
	let prev = -1
	let iloop = 0
	parent.text = text
	parent.lastIndex = 0
	while (1) {
		if (parent.lastIndex==prev) {
			iloop++
			if (iloop>5)
				throw new Error('infinite loop '+parent.lastIndex)
		} else
			iloop=0
		prev = parent.lastIndex
		let res = states[current].scan()
		if (!res)
			break
		let last = res[0]
		if (last)
			$out.append(pre(last))
		$out.append(pre(res[2], res[1][0]))
		current = res[1][1] || current
	}
	let last = parent.text.substring(parent.lastIndex)
	if (last)
		$out.append(pre(last))
}
