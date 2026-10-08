// Browser-side WCAG luminance measurement. Uses computed colors, composited
// alpha layers and gradient stop bounds, never Tailwind class-name guesses.
export function measureContrast() {
  const parse = value => {
    const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];
    return [...n.slice(0,3),n[3]??1];
  };
  const over=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
  const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const backdrop=element=>{
    const chain=[];for(let p=element;p;p=p.parentElement)chain.unshift(p);
    let colors=[[255,255,255]], opacity=1, complex=false;
    for(const p of chain){
      const s=getComputedStyle(p), bg=parse(s.backgroundColor);
      opacity*=Number(s.opacity);
      colors=colors.map(c=>over(bg,c));
      const stops=s.backgroundImage.match(/rgba?\([^)]+\)/g);
      if(stops)colors=colors.flatMap(c=>stops.map(stop=>over(parse(stop),c)));
      else if(s.backgroundImage!=='none')complex=true;
      // Collapse identical colors after an opaque layer.
      colors=[...new Map(colors.map(c=>[c.join(','),c])).values()];
    }
    return {colors,opacity,complex};
  };
  const results=[];
  const modal=document.querySelector('dialog:modal');
  for(const e of (modal||document.body).querySelectorAll('*')){
    const s=getComputedStyle(e);
    if(!e.getClientRects().length||s.visibility==='hidden'||s.display==='none'||e.closest('.sr-only,svg,script,style,option,[hidden],[aria-hidden="true"],button:disabled,input:disabled,select:disabled,textarea:disabled,[aria-disabled="true"]'))continue;
    if(e.checkVisibility && !e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
    const placeholder=e.matches('input[placeholder],textarea[placeholder]')&&!e.value;
    const direct=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
    if(!direct&&!placeholder&&!e.matches('input,textarea,select'))continue;
    const style=placeholder?getComputedStyle(e,'::placeholder'):s;
    const fg=parse(style.color), background=backdrop(e);
    fg[3]*=background.opacity*(placeholder?Number(style.opacity):1);
    const size=Number.parseFloat(s.fontSize),weight=Number.parseInt(s.fontWeight);
    const required=size>=24||(size>=18.6667&&weight>=700)?3:4.5;
    const ratios=background.colors.map(bg=>ratio(over(fg,bg),bg));
    results.push({chrome:Boolean(e.closest('[data-shell-navigation],[data-shell-header]')),text:(placeholder?e.getAttribute('placeholder'):direct||e.value||'').slice(0,100),tag:e.tagName,classes:e.getAttribute('class'),foreground:fg,backgrounds:background.colors,ratio:Math.min(...ratios),required,size,weight,complex:background.complex});
  }
  return results;
}

export function measureControl(element) {
  const color=value=>{const n=value.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [...n.slice(0,3),n[3]??1];};
  const over=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]+b[i]*(1-a[3]));
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const bg=e=>{const chain=[];for(let p=e;p;p=p.parentElement)chain.unshift(p);return chain.reduce((b,p)=>over(color(getComputedStyle(p).backgroundColor),b),[255,255,255]);};
  const s=getComputedStyle(element), b=bg(element), adjacent=bg(element.parentElement);
  const border=color(s.borderTopColor),outline=color(s.outlineColor);
  return {border:s.borderTopWidth,borderColor:s.borderTopColor,background:b,adjacent,fillRatio:ratio(b,adjacent),borderInside:ratio(over(border,b),b),borderOutside:ratio(over(border,adjacent),adjacent),outline:s.outlineStyle,outlineColor:s.outlineColor,outlineWidth:s.outlineWidth,focusRatio:ratio(over(outline,adjacent),adjacent),iconRatio:ratio(over(color(s.color),b),b)};
}
