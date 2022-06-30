"use strict"

class Highlighter {
	constructor(states, elem) {
		this.states = states
		this.elem = elem
		this.old_text = ""
		this.tokens = []
	}
	// wait, we can sorta optimize the prefix thing by uh
	// if tokens store their actual text, then
	// just compare each token with the eqv substring of newtext and see if it matches
	// instead of storing oldtext
	dirty_region(str2) {
		let str1 = this.old_text
		let tokens = this.tokens
		let ti=0, ind=0
		for (let i=0; i<str1.length+9; i++) {
			if (str1[i] !== str2[i])
				break
			// -9 - account for regex lookahead..
			if (i-9 >= ind+tokens[ti].len)
				ind += tokens[ti++].len
		}
		// now the end
		let shift = str2.length - str1.length
		let suff_start
		for (suff_start=str2.length; suff_start>=ind; suff_start--) {
			if (str2[suff_start] !== str1[suff_start-shift])
				break
		}
		return [ti, ind, ind+shift, suff_start+1]
	}
	parse(text) {
		let [t1, prefix, shift, suff_start] = this.dirty_region(text)
		let oldtokens = this.tokens
		let tokens = []
		let t2 = oldtokens.length // this only gets set for return
		// modifies: t2, tokens
		// uses: oldtokens, suff_start, dirty_start, shift, t1
		let output = (start, end, type, state)=>{
			let len = end-start
			if (!len)
				return
			// if we're in the region of text after the dirty part,
			// look for the first token that 
			if (start >= suff_start) {
				let ind2 = shift
				for (let i=t1; i<oldtokens.length && ind2<=start; i++) {
					let x = oldtokens[i]
					if (ind2==start && x.len==len && x.type==type && x.state==state) {
						t2 = i
						return true
					}
					ind2 += x.len
				}
				// if we reach here, that means there was a matching suffix on the text, but we couldn't sync states before the end. xd
			}
			tokens.push({len, type, state})
		}
		
		let lastIndex = prefix
		let current, s_name
		let to_state = (name)=>{
			s_name = name
			current = this.states[name]
			current.regex.lastIndex = lastIndex
		}
		to_state(t1>0 ? oldtokens[t1-1].state : 'data')
		
		let iloop = 0
		while (1) {
			let match = current.regex.exec(text)
			// insert the text between matches
			let end = match ? match.index : text.length
			if (output(lastIndex, end, null, s_name))
				break
			
			if (!match)
				break
			// infinite loop protection
			if (lastIndex == current.regex.lastIndex) {
				if (iloop++ > 5)
					throw new Error('infinite loop '+lastIndex)
			} else
				iloop=0
			// process match
			lastIndex = current.regex.lastIndex
			let g = current.groups[match.indexOf("", 1)-1]
			if (g.state)
				to_state(g.state)
			if (output(match.index, lastIndex, g.token, s_name))
				break
		}
		this.old_text = text
		oldtokens.splice(t1, t2-t1, ...tokens)
		// now, we just have to do the same .splice operation, but on the html
		return [t1, t2, tokens, prefix]
	}
	update(t) {
		// [start_token,end_token) is the region of output being replaced
		// nlen is the new last token index (i.e. if this region changes size)
		let [start_token, end_token, new_tokens, text_index] = this.parse(t)
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
		for (let token of new_tokens) {
			let changed
			let text = t.substr(text_index, token.len).replace(/[\0-\10\13\14\16-\37\177]/g, "￿") // 
			text_index += token.len
			let type = token.type || ""
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
		}
		while (elem1!=end_elem) {
			let next = elem1.nextSibling
			elem1.remove()
			elem1 = next
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
