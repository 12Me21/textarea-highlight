function print(token) {
	if (token.type)
		return `${token.start}..${token.end} - ${token.state} : ${token.type}`
	return `${token.start}..${token.end} - ${token.state}`
}

function prints(tokens) {
	console.log(tokens.map(print).join("\n"))
}

function first_difference(str1, str2, tokens) {
	let i
	let ti = 0
	for (i=0; i<str1.length; i++) {
		if (str1[i] !== str2[i])
			break
		if (i>=tokens[ti].end)
			ti++
	}
	return ti-1
}

function suffix_length(str1, str2, tokens) {
	let i
	for (i=0; i<str1.length; i++) {
		if (str1[str1.length-1-i]!==str2[str2.length-1-i])
			break
	}
	return i
}

class Parser {
	constructor(states) {
		this.states = states
	}
	parse(text, oldtext, oldtokens) {
		let iloop = 0
		let current, s_name
		
		let ti = first_difference(oldtext, text, oldtokens)
		let suffix = suffix_length(oldtext, text)
		let shift = text.length - oldtext.length
		let suff_start = text.length-suffix
		console.log("matching token:", ti)
		
		let token1
		let tokens
		if (ti<0)
			token1 = {start:0, end:0, type:undefined, state:'data'}
		else
			token1 = oldtokens[ti]
		ti++
		tokens = oldtokens.slice(0, ti)
		let lastIndex = token1.end
		
		let to_state = (name)=>{
			s_name = name
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		to_state(token1.state)
		
		let t2
		
		function output(start, end, type) {
			if (start==end)
				return
			if (start >= suff_start) {
				for (let i=0; i<oldtokens.length; i++) {
					let x = oldtokens[i]
					if (x.start+shift == start && x.end+shift == end && x.type == type && x.state == s_name) {
						t2 = i
						return
					}
				}
			}
			tokens[ti++] = {start, end, type, state:s_name}
		}
		
		console.log("starting on char: "+lastIndex, "suffix: ", suffix)
		
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
			if (g.state)
				s_name = g.state
			output(match.index, lastIndex, g.token)
			if (g.state)
				to_state(g.state)
			if (t2) {
				console.log('got sync!', t2)
				tokens.push(...oldtokens.slice(t2).map(x=>0||{start:x.start+shift,end:x.end+shift,type:x.type,state:x.state}))
				return tokens
			}
		}
		output(lastIndex, text.length)
		return tokens
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

function update(elem, old, nw) {
	
}
