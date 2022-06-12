class Parser {
	constructor(states) {
		this.states = states
	}
	parse(text, out) {
		let elem = out.firstChild
		let iloop = 0
		
		let current
		let lastIndex = 0
		let to_state = (name)=>{
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		function output(text, token) {
			if (text==="") return
			if (!elem) {
				elem = document.createElement('span')
				out.appendChild(elem)
			}
			if (elem.textContent != text)
				elem.textContent = text
			token = token || ""
			if (elem.className != token)
				elem.className = token
			elem = elem.nextSibling
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
			if ('function'==typeof g)
				g = g(match[0])
			output(match[0], g.token)
			if (g.state)
				to_state(g.state)
		}
		output(text.substring(lastIndex))
		if (elem)
			while (elem.nextSibling)
				elem.nextSibling.remove()
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

/* the state of the HTML parser's tokenization stage as follows, switching on the context element:

title
textarea
    Switch the tokenizer to the RCDATA state.
style
xmp
iframe
noembed
noframes
    Switch the tokenizer to the RAWTEXT state.
script
    Switch the tokenizer to the script data state.
noscript
    If the scripting flag is enabled, switch the tokenizer to the RAWTEXT state. Otherwise, leave the tokenizer in the data state.
plaintext
*/

let current_tag
function handle_tag_start(match) {
	current_tag = match.toLowerCase()
	return {token:'name', state:'in_tag'}
}
function handle_tag_end(match) {
	let tag = current_tag
	// RAWTEXT
	if (tag=='style' || tag=='xmp' || tag=='iframe' || tag=='noembed' || tag=='noframes' || tag=='script' || tag=='noscript')
		return {token:'tag', state:'rawtext'}
	// script data (close enough to RAWTEXT)
	if (tag=='script')
		return {token:'tag', state:'rawtext'}
	// RCDATA
	if (tag=='title' || tag=='textarea')
		return {token:'tag', state:'rcdata'}
	current_tag = null
	return {token:'tag', state:'data'}
}
function handle_rawtext_end(match) {
	if (match.toLowerCase() != "</"+current_tag)
		return {state:'rawtext'}
	current_tag = null
	return {token:'tag', state:'in_tag'}
}
// todo: function to determine new state
// "default" highlight for skipped chars (i.e. within rawtext states)

let htmlp = new Parser({
	data: STATE`
&([a-zA-Z0-9]+|#[xX][0-9a-fA-F]+|#[0-9]+);?${{token:'charref'}}
<(?=/?[a-zA-Z])${{token:'tag', state:'tag'}}
<!---?>${{token:'comment'}}
<!--${{token:'comment', state:'comment'}}
<[!?/][^>]*>?${{token:'comment'}}
`,
	comment: STATE`
(--!?>|$)${{token:'comment', state:'data'}}
`,
	tag: STATE`
[a-zA-Z][^\s/>]*${handle_tag_start}
/[a-zA-Z][^\s/>]*${{token:'name', state:'in_tag'}}
`,	
	in_tag: STATE`
[\s/]*(>${handle_tag_end}
=[^\s/>=]*${{token:'key', state:'after_key'}}
[^\s/>=]+${{token:'key', state:'after_key'}})
`,
	after_key: STATE`
\s*=\s*${{state:'value'}}
(?:)${{state:'in_tag'}}
`,
	value: STATE`
"[^"]*"?${{token:'value', state:'in_tag'}}
'[^']*'?${{token:'value', state:'in_tag'}}
[^\s>]*${{token:'value', state:'in_tag'}}
`,
	rawtext: STATE`
</[a-zA-Z]+(?![^\s/>])${handle_rawtext_end}
`,
	rcdata: STATE`
&([a-zA-Z0-9]+|#[xX][0-9a-fA-F]+|#[0-9]+);?${{token:'charref'}}
</[a-zA-Z]+(?![^\s/>])${handle_rawtext_end}
`,
})
