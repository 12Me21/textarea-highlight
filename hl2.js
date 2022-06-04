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
		`</?[a-z][^\t\n\f />]*/?(>(?<tag_>))?(?<tag_attributes>)`,
		`(<!--(-?>|[^]*?(--!?>|$))|<[!?/][^>]*(>|$))(?<comment_>)`,
		`<script>(?<tag_script>)`,
	),
	script: new State(
		parent,
		`(?=</script)(?<text_data>)`,
		//`<![dD][oO][cC][tT][yY][pP][eE][^]*?(>|$)(?<doctype_>)`,
		//`(<!--(-?>|[^]*?(--!?>|$))|<![^>]*(>|$))(?<comment_>)`,
	),
	attributes: new State(
		parent,
		`>(?<tag_data>)`
	),
}
$in.oninput = e=>{
	go($in.value)
}

function pre(text) {
	let p = document.createElement('pre')
	p.append(text)
	return p
}
function go(text) {
	$out.textContent = ""
	let current = 'data'
	let prev = -1
	parent.text = text
	parent.lastIndex = 0
	while (1) {
		if (parent.lastIndex==prev)	
			throw new Error('infinite loop '+parent.lastIndex)
		prev = parent.lastIndex
		let res = states[current].scan()
		if (!res)
			break
		let last = res[0]
		if (last) {
			$out.append("text: ", pre(last))
			$out.append("\n")
		}
		$out.append(res[1][0]+": ", pre(res[2]))
		$out.append("\n")
		current = res[1][1] || current
	}
	let last = parent.text.substring(parent.lastIndex)
	if (last) {
		$out.append("text: ", pre(last))
		$out.append("\n")
	}
}
