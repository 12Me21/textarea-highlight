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
	let ind = 0
	let offset = 1 // account for regex lookahead..
	for (i=-offset; i<str1.length; i++) {
		if (str1[i+offset] !== str2[i+offset])
			break
		if (i >= ind+tokens[ti].len) {
			ind += tokens[ti].len
			ti++
		}
	}
	return [ti-1, ind]
}

let nw = 0

class Parser {
	constructor(states) {
		this.states = states
	}
	parse(text, oldtext, oldtokens) {
		nw++
		let iloop = 0
		let current, s_name
		let [t1, ind] = first_difference(oldtext, text, oldtokens)
		let shift = text.length - oldtext.length
		let suff_start
		for (suff_start=text.length; suff_start>=ind; suff_start--) {
			if (text[suff_start] !== oldtext[suff_start-shift])
				break
		}
		suff_start++
		let t2 = null
		
		let token1
		let tokens
		if (t1<0) {
			token1 = {len:0, type:undefined, state:'data'}
			tokens = []
		} else {
			token1 = oldtokens[t1]
			tokens = oldtokens.slice(0, t1+1)
		}
		let lastIndex = ind
		
		let to_state = (name)=>{
			s_name = name
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		to_state(token1.state)
		
		function output(start, end, type) {
			if (start==end)
				return
			if (start >= suff_start) {
				let ind2=ind+shift
				for (let i=t1+1; i<oldtokens.length; i++) {
					let x = oldtokens[i]
					if (ind2==start && ind2+x.len==end && x.type==type && x.state==s_name) {
						t2 = i
						return true
					}
					ind2 += x.len
				}
			}
			tokens.push({len:end-start, type, state:s_name, new:nw})
		}
		
		function merge() {
			if (t2==null)
				return [tokens, t1, t2, tokens.length, ind]
			return [tokens.concat(oldtokens.slice(t2)), t1, t2, tokens.length, ind]
		}
		//console.log("starting on char: "+lastIndex, "suffix: ", suffix)
		
		let match
		while (match = current.regex.exec(text)) {
			if (output(lastIndex, match.index))
				return merge()
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
			if (output(match.index, lastIndex, g.token))
				return merge()
			if (g.state)
				to_state(g.state)
		}
		output(lastIndex, text.length)
		return merge()
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
	current_tag = 'a'//match.toLowerCase()
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
\n${{}}
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

let old_tokens=[], old_text=""
function render(t, out) {
	let [tokens, t1, t2, nlen, ind] = htmlp.parse(t, old_text, old_tokens)
	old_tokens = tokens
	old_text = t
	let elem1 = out.childNodes[t1+1]
	let elem2 = t2==null ? null : out.childNodes[t2]
	$status.textContent = (t1+1)+".."+(t2==null ? "end" : t2-1)
	let prev
	for (let i=t1+1; i<nlen; i++) {
		let changed
		if (elem1==elem2) {
			elem1 = document.createElement('span')
			out.insertBefore(elem1, elem2)
			changed = true
		}
		let text = t.substr(ind, tokens[i].len)
		if (elem1.textContent != text) {
			elem1.textContent = text
			changed = true
		}
		if (elem1.className != tokens[i].type) {
			elem1.className = tokens[i].type
			changed = true
		}
		if (changed)
			elem1.dataset.anim = elem1.dataset.anim=='false'
		elem1 = elem1.nextSibling
		ind += tokens[i].len
	}
	while (elem1!=elem2) {
		let prev = elem1
		elem1 = elem1.nextSibling
		prev.remove()
	}
}
