'use strict'

class Parser {
	constructor(states) {
		this.states = states
	}
	parse(text, elem) {
		let iloop = 0
		let current
		
		let lastIndex = 0
		
		let to_state = (name)=>{
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		elem.textContent = ""
		to_state("data")
		
		function output(start, end, type) {
			if (start==end)
				return
			let p = document.createElement('span')
			p.className = type
			p.textContent = text.substring(start, end)
			elem.appendChild(p)
		}
		
		let match
		while (match = current.regex.exec(text)) {
			output(lastIndex, match.index)
			// infinite loop protection
			if (lastIndex == current.regex.lastIndex) {
				if (iloop++ > 5)
					throw new Error('infinite loop '+lastIndex)
			} else
				iloop=0
			// process match
			lastIndex = current.regex.lastIndex
			let g = current.groups[match.indexOf("", 1)-1]
			if ('function'==typeof g)
				g = g(match[0])
			output(match.index, lastIndex, g.token)
			if (g.state)
				to_state(g.state)
		}
		output(lastIndex, text.length)
	}
}

function STATE({raw}, ...values) {
	let r = raw.join("()").slice(1, -1)
		.replace(/\n/g, "|").replace(/\\`/g, "`")
		.replace(/[(](?![?)])/g, "(?:")
	let regex = new RegExp(r, 'g')
	return {regex, groups: values}
}

let parse_js = new Parser({
	data: STATE`
(break|catch|class|continue|default|do|else|finally|for|function|if|switch|try|while|with|case|return|throw|yield|yield|=>)(?![\w$])${{token:'flow'}}
(typeof|await|delete|void|in|instanceof|new)(?![\w$])${{token:'operator'}}
[?]?[.]\s*${{state:'property'}}
([+-]{2}|[!=]==?|[!~])${{token:'operator'}}
=${{token:'assignment'}}
([-*%+&^|]|[*<>&|?]{2}|>>>)(=${{token:'assignment'}})?${{token:'operator'}}
([?]|:|[<>]=?)${{token:'operator'}}
(super|this)(?![\w$])${{token:'keyword', state:'after_value'}}
(const|debugger|export|import|var|enum|implements|interface|let|package|private|protected|public|static|extends)(?![\w$])${{token:'keyword'}}
(?!\d)[\w$]+(?=\s*:)${{token:'property', state:'after_label'}}
(?!\d)[\w$]+${{token:'word', state:'after_value'}}
/(?![*/])([^/\n\\]+|\\.)*?(/[idgmuy]*|\n|$)${{token:'string', state:'after_value'}}
"([^\n\\"]+|\\[^])*?("|\n|$)${{token:'string', state:'after_value'}}
'([^\n\\']+|\\[^])*?('|\n|$)${{token:'string', state:'after_value'}}
\`([^\\\`]+|\\[^])*?(\`|$)${{token:'string', state:'after_value'}}
//.*${{token:'comment'}}
/[*][^]*?([*]/|$)${{token:'comment'}}
<!--.*${{token:'comment'}}
(0[xXbBoO]|[.])?[\dA-Fa-f]+(_?[\dA-Fa-f]+)*${{token:'constant', state:'after_value'}}
\n${{}}
;${{token:'semicolon'}}
`,
	after_value: STATE`
/=${{token:'assignment'}}
/${{token:'operator'}}
[+-]{2}${{token:'operator'}}
${{state:'data'}}
`,
	property: STATE`
(?!\d)[\w$]+${{token:'property', state:'data'}}
${{state:'data'}}
`,
	after_label: STATE`
\s*:${{state:'data'}}
`
})
