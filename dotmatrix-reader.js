/* Metro Park Dot Matrix reader — browser-side, no uploads until confirmed. */
async function mpReadMatrix(file, validIds) {
  if (!window.fflate) throw Error('Pembaca ZIP Excel belum dimuat');
  const bytes=new Uint8Array(await file.arrayBuffer()), zip=fflate.unzipSync(bytes);
  const xml=(p)=>{if(!zip[p])throw Error('Bagian Excel tidak ditemukan: '+p);return new DOMParser().parseFromString(fflate.strFromU8(zip[p]),'application/xml')};
  const tags=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
  const book=xml('xl/workbook.xml'), rel=xml('xl/_rels/workbook.xml.rels');
  const targets=new Map(tags(rel,'Relationship').map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
  const shared=zip['xl/sharedStrings.xml']?tags(xml('xl/sharedStrings.xml'),'si').map(si=>tags(si,'t').map(t=>t.textContent).join('')):[];
  const styles=xml('xl/styles.xml');
  const fills=tags(tags(styles,'fills')[0],'fill').map(f=>tags(f,'patternFill')[0]?.getAttribute('patternType')||'none');
  const xfs=tags(tags(styles,'cellXfs')[0],'xf').map(x=>Number(x.getAttribute('fillId')||0));
  const valid=new Set(validIds||[]), output=[], warnings=[], seen=new Set();
  function cellValue(c){const v=tags(c,'v')[0];if(c.getAttribute('t')==='s')return shared[Number(v?.textContent||0)]||'';if(c.getAttribute('t')==='inlineStr')return tags(c,'t').map(t=>t.textContent).join('');return v?.textContent||''}
  function col(ref){let n=0;for(const ch of (ref.match(/^[A-Z]+/)||[''])[0])n=n*26+ch.charCodeAt(0)-64;return n}
  function classify(symbol,hatched){
    const s=symbol.replace(/\s/g,'').toUpperCase(), refund=(s.match(/R/g)||[]).length;
    const last=s.slice(-1);
    if(!s)return null;
    if(!/^[R○●]+$/.test(s))return {unknown:true};
    if(hatched&&last!=='○')return {unknown:true,reason:'Arsiran tanpa lingkaran kosong terakhir'};
    let status=last==='○'?(hatched?'Sedang renovasi':'Sudah habis masa berlaku'):last==='●'?'Sudah BAPFO tapi deposit belum refund':'Deposit sudah refund';
    return {status,sedang_renovasi:hatched,refund_count:refund,renovation_count:s.length};
  }
  for(const sheet of tags(book,'sheet')){
    const name=sheet.getAttribute('name')||'';
    const rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const target=targets.get(rid);if(!target)continue;
    const path=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target.replace(/^\.\//,'');
    const doc=xml(path), rows=tags(doc,'sheetData')[0];if(!rows)continue;
    const grid=new Map();
    for(const row of tags(rows,'row')){const m=new Map();for(const c of tags(row,'c'))m.set(col(c.getAttribute('r')||''),{value:cellValue(c).trim(),style:Number(c.getAttribute('s')||0)});grid.set(Number(row.getAttribute('r')),m)}
    const apartment=/manhattan/i.test(name)?'MA':/milan/i.test(name)?'MI':null;
    const sections=[];
    if(apartment)sections.push({tower:apartment,header:8,start:9,end:999});
    else if(/kios/i.test(name)){sections.push({tower:'MA',header:8,start:9,end:10},{tower:'MI',header:16,start:17,end:18})}
    else {warnings.push('Sheet tidak dikenali: '+name);continue}
    for(const sec of sections){
      const headers=grid.get(sec.header)||new Map();
      for(let rownum=sec.start;rownum<=sec.end;rownum++){
        const cells=grid.get(rownum);if(!cells)continue;
        const floor=(cells.get(1)?.value||'').toUpperCase();
        if(!/^(UG|LG|\d{1,2})$/.test(floor))continue;
        for(const [c,h] of headers){
          if(c<2)continue;
          let code=h.value.toUpperCase();
          if(sec.header===8||sec.header===16) {
            if(!apartment){if(!/^\d+$/.test(code))continue;code=code.padStart(2,'0')}
            else if(!/^[A-Z]{2,3}$/.test(code))continue;
          }
          const id=sec.tower+'/'+floor+'/'+code;
          if(valid.size&&!valid.has(id))continue;
          const current=cells.get(c);if(!current||!current.value)continue;
          const pattern=fills[xfs[current.style]||0]||'none';
          const hatched=pattern==='lightUp'||pattern==='darkUp'||pattern==='lightDown'||pattern==='darkDown';
          const result=classify(current.value,hatched);
          if(!result)continue;
          if(result.unknown){warnings.push(id+' ('+current.value+'): '+(result.reason||'Simbol belum dikenali'));continue}
          if(seen.has(id)){warnings.push('ID ganda: '+id);continue}
          seen.add(id);output.push({unit_id:id,symbol:current.value,...result,sheet:name});
        }
      }
    }
  }
  return {rows:output,warnings,period:'2026-11-10'};
}
