function pre(text, cls) {
	let p = document.createElement('span')
	if (cls)
		p.className = cls
	p.append(text)
	return p
}

class Parser {
	constructor(states) {
		this.states = states
	}
	parse(text, out) {
		out.textContent = ""
		
		let iloop = 0
		
		let current
		let lastIndex = 0
		let to_state = (name)=>{
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		function output(text, token) {
			if (text!=="")
				out.append(pre(text, token))
		}
		
		to_state('data')
		let match
		while (match = current.regex.exec(text)) {
			output(text.substring(lastIndex, match.index))
			// infinite loop protection
			if (lastIndex == current.regex.lastIndex) {
				if (iloop++ > 5)
					throw new Error('infinite loop '+lastIndex)
			} else
				iloop=0
			// process match
			lastIndex = current.regex.lastIndex
			let g = current.groups[match.indexOf("", 1)-1]
			output(match[0], g.token)
			if (g.state)
				to_state(g.state)
		}
		output(text.substring(lastIndex))
	}
}

function STATE({raw}, ...values) {
	let r = raw.join("()").slice(1, -1)
		.replace(/\n/g, "|").replace(/\\`/g, "`")
		.replace(/[(](?![?)])/g, "(?:")
	let regex = new RegExp(r, 'g')
	return {regex, groups: values}
}

/*

attrs:

before name:
[\s/]*>  - data
[\s/]*=?[^\s/>]+  - after name

after name:
\s*=\s*  - value
(?:)  - before name

value:
"[^"]*("|$)  - before name
'[^']*('|$)  - before name
[^\s>]*  - before name
> data

*/

// todo: function to determine new state
// "default" highlight for skipped chars (i.e. within rawtext states)

let htmlp = new Parser({
	data: STATE`
&([a-zA-Z0-9]+|#[xX][0-9a-fA-F]+|#[0-9]+);?${{token:'charref'}}
<script>${{token:'tag', state:'script'}}
<style>${{token:'tag', state:'rawtext'}}
</?[a-zA-Z][^\s/>]*[\s/]*(/?>${{token:'tag'}})?${{token:'tag', state:'in_tag'}}
<!---?>${{token:'comment'}}
<!--${{token:'comment', state:'comment'}}
<[!?][^>]*(>|$)${{token:'comment'}}
`,
	in_tag: STATE`
[\s/]+${{state:'in_tag'}}
>${{token:'tag', state:'data'}}
=[^\s/>=]*${{token:'key', state:'after_key'}}
[^\s/>=]+${{token:'key', state:'after_key'}}
`,
	after_key: STATE`
\s*=\s*${{state:'value'}}
(?:)${{state:'in_tag'}}
`,
	value: STATE`
"[^"]*("|$)${{token:'value', state:'in_tag'}}
'[^']*('|$)${{token:'value', state:'in_tag'}}
[^\s>]*${{token:'value', state:'in_tag'}}
`,
	comment: STATE`
(--!?>|$)${{token:'comment', state:'data'}}
`,
	script: STATE`
(?=</script(?![^\s/>])${{state:'data'}}|$${{state:'data'}})
`,
	rawtext: STATE`
(?=</style(?![^\s/>])${{state:'data'}}|$${{state:'data'}})
`,
})
