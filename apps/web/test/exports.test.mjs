import assert from 'node:assert/strict'
import test from 'node:test'
import {getExportRange,groupExportDays,buildListHtml,filterExportBlocks,escapeMarkup} from '../src/exports/export-data.ts'
import {buildCalendarSvg,wrapText,assertPngSize,calendarPng} from '../src/exports/calendar-image.ts'

const activity=(id,schedule,overrides={})=>({id,type:'personal.event',title:`Actividad ${id}`,status:'pending',details:{people:[]},schedule,...overrides})
const day=date=>({kind:'date',role:'start',date,at:null,end_at:null})
const instant=at=>({kind:'instant',role:'start',date:null,at,end_at:null})
const interval=(at,end_at)=>({kind:'interval',role:'start',date:null,at,end_at})

test('export periods handle leap months, Monday weeks crossing years and Madrid daylight-saving days',()=>{
 assert.equal(getExportRange('month','2028-02').to,'2028-03-01')
 const week=getExportRange('week','2026-12-31')
 assert.equal(week.from,'2026-12-28');assert.equal(week.to,'2027-01-04')
 const date=getExportRange('day','2026-10-25')
 assert.equal(date.from,'2026-10-25');assert.equal(date.to,'2026-10-26')
 for(const value of ['2026-02-31','2026-13-01','invalid']) assert.throws(()=>getExportRange('day',value),/válida/)
})

test('exports group all selected days, keep midnight ends exclusive, deduplicate IDs and put untimed events last',()=>{
 const range=getExportRange('month','2026-11')
 const items=[activity('date',day('2026-11-25')),activity('late',instant('2026-11-25T17:00:00Z')),activity('early',instant('2026-11-25T08:00:00Z')),activity('early',instant('2026-11-25T08:00:00Z')),activity('span',interval('2026-11-25T23:00:00Z','2026-11-27T23:00:00Z'))]
 const days=groupExportDays(range,items)
 assert.equal(days.length,30)
 assert.deepEqual(days.find(day=>day.date==='2026-11-25').activities.map(item=>item.id),['early','late','date'])
 assert.equal(days.find(day=>day.date==='2026-11-26').activities[0].id,'span')
 assert.equal(days.find(day=>day.date==='2026-11-27').activities[0].id,'span')
 assert.equal(days.find(day=>day.date==='2026-11-28').activities.length,0)
})

test('block selection filters both files and legends, including exams with academic and legacy plans with Others',()=>{
 const range=getExportRange('month','2026-11')
 const items=[activity('assignment',day('2026-11-25'),{type:'academic.assignment',title:'Entrega privada'}),activity('exam',day('2026-11-25'),{type:'academic.exam',title:'Examen privado'}),activity('gym',day('2026-11-25'),{type:'sport.gym',title:'Entrenamiento privado'}),activity('personal',day('2026-11-25'),{title:'Cita privada'}),activity('legacy',day('2026-11-25'),{type:'social.plan',title:'Plan anterior'})]
 assert.deepEqual(filterExportBlocks(items,['academic']).map(item=>item.id),['assignment','exam'])
 assert.deepEqual(filterExportBlocks(items,['personal']).map(item=>item.id),['personal','legacy'])
 assert.deepEqual(filterExportBlocks(items,[]),[])
 const html=buildListHtml(range,groupExportDays(range,items),false,true,['academic'])
 assert.ok(html.includes('Entrega privada')&&html.includes('Examen privado'))
 assert.ok(!html.includes('Entrenamiento privado')&&!html.includes('Cita privada'))
 const image=buildCalendarSvg(range,items,text=>text.length*8,['personal'])
 assert.ok(image.svg.includes('Cita privada')&&image.svg.includes('Plan anterior'))
 assert.ok(!image.svg.includes('Entrega privada')&&!image.svg.includes('Entrenamiento privado'))
 assert.ok(!image.svg.includes('>Gimnasio</text>')&&!image.svg.includes('>Exámenes</text>'))
})

test('formatted list escapes untrusted titles and details, hides optional details and has a printable empty state',()=>{
 const range=getExportRange('day','2026-11-25')
 const item=activity('unsafe',day(range.from),{title:'<img src=x onerror="alert(1)">',details:{people:['<script>unsafe</script>']}})
 const days=groupExportDays(range,[item])
 const html=buildListHtml(range,days,true)
 assert.ok(html.includes('&lt;img')&&html.includes('&lt;script&gt;'))
 assert.ok(!html.includes('<img src=')&&!html.includes('<script>unsafe'))
 assert.ok(html.includes('@page{size:A4')&&html.includes('window.print()'))
 assert.ok(!buildListHtml(range,days,false,false).includes('unsafe&lt;/script&gt;'))
 assert.ok(!buildListHtml(range,days,true,false).includes('onclick='))
 assert.ok(buildListHtml(range,groupExportDays(range,[]),false).includes('No hay actividades'))
 const unsafeSvg=buildCalendarSvg(getExportRange('month','2026-11'),[item],text=>text.length*8).svg
 assert.ok(!unsafeSvg.includes('<img src=')&&!unsafeSvg.includes('<script>unsafe'))
 assert.equal(escapeMarkup('a\u0000b'), 'ab')
})

test('monthly image grows to show every event and wraps long words without dropping text',()=>{
 const range=getExportRange('month','2026-11')
 const empty=buildCalendarSvg(range,[])
 const items=Array.from({length:65},(_,index)=>activity(String(index),day('2026-11-30'),{title:`Evento ${index} extraordinariamenteLargoSinEspaciosParaNoRecortarTexto`}))
 const crowded=buildCalendarSvg(range,items,text=>text.length*9)
 assert.ok(crowded.height>empty.height)
 assert.equal((crowded.svg.match(/<g>/g)??[]).length,65)
 assert.ok(crowded.svg.includes('Evento 64'))
 assert.ok(crowded.svg.includes('>Lunes</text>')&&crowded.svg.includes('>Domingo</text>'))
 const word='W'.repeat(120)
 const wrapped=wrapText(word,80,text=>text.length*10)
 assert.equal(wrapped.join(''),word)
 const emoji='👩‍👩‍👧‍👦'.repeat(8)
 const segmenter=new Intl.Segmenter('es',{granularity:'grapheme'})
 const emojiLines=wrapText(emoji,60,text=>[...segmenter.segment(text)].length*20)
 assert.equal(emojiLines.join(''),emoji)
 assert.ok(emojiLines.every(line=>[...segmenter.segment(line)].length<=3))
 assert.ok(wrapped.every(line=>line.length<=8))
 assert.throws(()=>assertPngSize(2240,20000),/SVG/)
 assert.doesNotThrow(()=>assertPngSize(empty.width,empty.height))

})


test('cancelling PNG generation rejects before allocating browser image or canvas resources',async()=>{
 const controller=new AbortController();controller.abort()
 const image=buildCalendarSvg(getExportRange('month','2026-11'),[])
 await assert.rejects(calendarPng(image,controller.signal),error=>error.name==='AbortError')
})

test('weekly and daily images keep complete agendas, selected blocks, escaped details and untimed ordering',()=>{
 const week=getExportRange('week','2026-12-31')
 const items=[activity('untimed',day('2026-12-31'),{title:'Último sin hora'}),activity('timed',instant('2026-12-31T08:00:00Z'),{title:'Primero con hora',details:{people:['Ana & <Luis>']}}),activity('hidden',day('2026-12-31'),{type:'sport.gym',title:'NO INCLUIR'}),activity('span',interval('2026-12-30T23:00:00Z','2026-12-31T23:00:00Z'),{title:'Solo jueves'})]
 const image=buildCalendarSvg(week,items,text=>text.length*9,['personal'])
 assert.ok(image.svg.includes('Lunes')&&image.svg.includes('Domingo')&&image.svg.includes('enero'))
 assert.ok(!image.svg.includes('NO INCLUIR'))
 assert.equal((image.svg.match(/Solo jueves/g)??[]).length,1)
 assert.ok(image.svg.indexOf('Primero con hora')<image.svg.indexOf('Último sin hora'))
 const dailyRange=getExportRange('day','2026-12-31')
 const daily=buildCalendarSvg(dailyRange,items,text=>text.length*9,['personal'])
 assert.ok(daily.svg.includes('Ana &amp; &lt;Luis&gt;'))
 assert.ok(!daily.svg.includes('<Luis>')&&!daily.svg.includes('NO INCLUIR'))
 assert.ok(!daily.svg.includes('foreignObject')&&!daily.svg.includes('<script'))
 for(const range of [week,dailyRange]) {
  const empty=buildCalendarSvg(range,[])
  assert.ok(empty.svg.includes('Sin actividades'))
  assert.doesNotThrow(()=>assertPngSize(empty.width,empty.height))
  const many=Array.from({length:40},(_,id)=>activity(String(id),day('2026-12-31'),{title:'Un título muy extenso '.repeat(12)+id}))
  const crowded=buildCalendarSvg(range,many,text=>text.length*9)
  assert.equal((crowded.svg.match(/<g>/g)??[]).length,40)
  assert.ok(crowded.height>empty.height)
 }
})
