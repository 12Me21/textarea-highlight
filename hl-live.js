function first_difference(str1, str2, tokens) {
	let i
	let ti = 0
	let ind = 0
	let offset = 9 // account for regex lookahead..
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

// todo: function to determine new state
// "default" highlight for skipped chars (i.e. within rawtext states)

let parse_html = new Parser({
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
script(?![^\s/>])${{token:'name', state: 'in_script_tag'}}
[a-zA-Z][^\s/>]*${{token:'name', state:'in_tag'}}
/[a-zA-Z][^\s/>]*${{token:'name', state:'in_tag'}}
`,	
	in_tag: STATE`
[\s/]*(>${{token:'tag', state:'data'}}
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
	
	in_script_tag: STATE`
[\s/]*(>${{token:'tag', state: 'js'}}
=[^\s/>=]*${{token:'key', state:'after_script_key'}}
[^\s/>=]+${{token:'key', state:'after_script_key'}})
`,
	after_script_key: STATE`
\s*=\s*${{state:'script_value'}}
(?:)${{state:'in_script_tag'}}
`,
	script_value: STATE`
"[^"]*"?${{token:'value', state:'in_script_tag'}}
'[^']*'?${{token:'value', state:'in_script_tag'}}
[^\s>]*${{token:'value', state:'in_script_tag'}}
`,
	
	js: STATE`
(?=</script)${{state:'data'}}
(break|catch|class|continue|default|do|else|finally|for|function|if|switch|try|while|with|case|return|throw|yield|yield|=>)(?![\w$])${{token:'flow'}}
(typeof|await|delete|void|in|instanceof|new)(?![\w$])${{token:'operator'}}
[?]?[.]\s*${{state:'js_property'}}
([+-]{2}|[!=]==?|[!~])${{token:'operator'}}
=${{token:'assignment'}}
([-*%+&^|]|[*<>&|?]{2}|>>>)(=${{token:'assignment'}})?${{token:'operator'}}
([?]|:|[<>]=?)${{token:'operator'}}
(super|this)(?![\w$])${{token:'keyword', state:'js_after_value'}}
(const|debugger|export|import|var|enum|implements|interface|let|package|private|protected|public|static|extends)(?![\w$])${{token:'keyword'}}
(?!\d)[\w$]+(?=\s*:)${{token:'property', state:'js_after_label'}}
(?!\d)[\w$]+${{token:'word', state:'js_after_value'}}
"${{token:'string', state:'js_string1'}}
'${{token:'string', state:'js_string2'}}
\`${{token:'string', state:'js_string3'}}
//${{token:'comment',state:'js_comment'}}
/[*]${{token:'comment',state:'js_block_comment'}}
/${{token:'string', state:'js_regex'}}
<!--${{token:'comment',state:'js_comment'}}
(0[xXbBoO]|[.])?[\dA-Fa-f]+(_?[\dA-Fa-f]+)*${{token:'constant', state:'js_after_value'}}
\n${{}}
;${{token:'semicolon'}}
`,
	js_regex: STATE`
(?=</script)${{state:'data'}}
\n${{state:'js'}}
\\[/\\]${{}}
/[idgmuy]*${{token:'string',state:'js_after_value'}}
`,
	js_string1: STATE`
(?=</script)${{state:'data'}}
\n${{state:'js'}}
\\["\\\n]${{}}
"${{token:'string',state:'js_after_value'}}
`,
	js_string2: STATE`
(?=</script)${{state:'data'}}
\n${{state:'js'}}
\\['\\\n]${{}}
'${{token:'string',state:'js_after_value'}}
`,
	js_string3: STATE`
(?=</script)${{state:'data'}}
\\[\`\\]${{}}
\`${{token:'string',state:'js_after_value'}}
`,
	js_comment: STATE`
(?=</script)${{state:'data'}}
\n${{token:'comment', state:'js'}}
`,
	js_block_comment: STATE`
(?=</script)${{state:'data'}}
[*]/${{token:'comment', state:'js'}}
`,
	js_after_value: STATE`
(?=</script)${{state:'data'}}
/=${{token:'assignment'}}
/${{token:'operator'}}
[+-]{2}${{token:'operator'}}
${{state:'js'}}
`,
	js_property: STATE`
(?=</script)${{state:'data'}}
(?!\d)[\w$]+${{token:'property', state:'js'}}
${{state:'js'}}
`,
	js_after_label: STATE`
\s*:${{state:'js'}}
`
})

let parser = parse_html
let old_tokens=[], old_text=""
function render(t, out) {
	let [tokens, t1, t2, nlen, ind] = parser.parse(t, old_text, old_tokens)
	let pp = performance.now()
	old_tokens = tokens
	old_text = t
	let elem1 = out.childNodes[t1+1]
	let elem2 = t2==null ? null : out.childNodes[t2]
	$status.textContent = (t1+1)+".."+(t2==null ? "end" : t2-1)
	let prev
	// todo: delete nodes with this?
	//let range = document.createRange()
	//range.setStart(out, nlen)
	//range.setEndBefore(out, t2)
	for (let i=t1+1; i<nlen; i++) {
		let changed
		if (elem1==elem2) {
			elem1 = document.createElement('span')
			out.insertBefore(elem1, elem2)
			changed = true
		}
		let text = t.substr(ind, tokens[i].len).replace(/[\0-\10\13\14\16-\37\177]/g, "￿") // 
		if (elem1.textContent != text) {
			elem1.textContent = text
			changed = true
		}
		if (elem1.className != tokens[i].type) {
			elem1.className = tokens[i].type||""
			changed = true
		}
//		if (changed)
		//	elem1.dataset.anim = elem1.dataset.anim=='false'
		elem1 = elem1.nextSibling
		ind += tokens[i].len
	}
	while (elem1!=elem2) {
		let prev = elem1
		elem1 = elem1.nextSibling
		prev.remove()
	}
	return pp
}
