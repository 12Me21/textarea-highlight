"use strict"

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
	return [ti, ind]
}

class Highlighter {
	constructor(states, elem) {
		this.states = states
		this.elem = elem
		this.old_text = ""
		this.tokens = []
	}
	parse(text) {
		let oldtext = this.old_text
		let oldtokens = this.tokens
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
		
		let tokens = oldtokens.slice(0, t1)
		let lastIndex = ind
		
		let to_state = (name)=>{
			s_name = name
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		to_state(t1>0 ? tokens[t1-1].state : 'data')
		
		function output(start, end, type) {
			if (start==end)
				return
			if (start >= suff_start) {
				let ind2=ind+shift
				for (let i=t1; i<oldtokens.length; i++) {
					let x = oldtokens[i]
					if (ind2==start && ind2+x.len==end && x.type==type && x.state==s_name) {
						t2 = i
						return true
					}
					ind2 += x.len
				}
			}
			tokens.push({len:end-start, type, state:s_name})
		}
		
		let finish = ()=>{
			this.old_text = text
			this.tokens = t2==null ? tokens : tokens.concat(oldtokens.slice(t2))
			return [t1, t2, tokens.length, ind]
		}
		
		let match
		while (match = current.regex.exec(text)) {
			if (output(lastIndex, match.index))
				return finish()
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
				return finish()
			if (g.state)
				to_state(g.state)
		}
		output(lastIndex, text.length)
		return finish()
	}
	update(t) {
		// [start_token,end_token) is the region of output being replaced
		// nlen is the new last token index (i.e. if this region changes size)
		let [start_token, end_token, nlen, text_index] = this.parse(t)
		let tokens = this.tokens
		let out = this.elem
		let pp = performance.now()
		let elem1 = out.childNodes.item(start_token)
		let end_elem = out.childNodes.item(end_token)
		let nchanged = 0
		// todo: delete nodes with this?
		//let range = document.createRange()
		//range.setStart(out, nlen)
		//range.setEndBefore(out, t2)
		for (let i=start_token; i<nlen; i++) {
			let changed
			let text = t.substr(text_index, tokens[i].len).replace(/[\0-\10\13\14\16-\37\177]/g, "￿") // 
			let type = tokens[i].type||""
			// reached end of delete region, start adding new elems
			if (elem1==end_elem) {
				elem1 = document.createElement('span')
				out.insertBefore(elem1, end_elem)
				changed = true
			}
			if (elem1.textContent != text) {
				elem1.textContent = text
				changed = true
			}
			
			if (elem1.className != type) {
				elem1.className = type
				changed = true
			}
			if (changed)
				nchanged++
			elem1 = elem1.nextSibling
			text_index += tokens[i].len
		}
		while (elem1!=end_elem) {
			let prev = elem1
			elem1 = elem1.nextSibling
			prev.remove()
			nchanged++
		}
		$status.textContent = nchanged
		return pp
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

let html_syntax = {
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
}
