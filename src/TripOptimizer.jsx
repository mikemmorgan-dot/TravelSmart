import React, { useState, useMemo, useEffect, useRef } from "react";
import { AIRPORTS } from "./airports";

// ---- Airport typeahead: type a city, airport name, or code; pick from matches ----
function searchAirports(q){
  q=q.trim().toLowerCase();
  if(q.length<2) return [];
  const starts=[], cityStarts=[], contains=[];
  for(const a of AIRPORTS){
    const [iata,name,city]=a;
    const li=iata.toLowerCase(), lc=city.toLowerCase(), ln=name.toLowerCase();
    if(li===q) starts.unshift(a);                       // exact code first
    else if(li.startsWith(q)) starts.push(a);
    else if(lc.startsWith(q)) cityStarts.push(a);
    else if(lc.includes(q)||ln.includes(q)) contains.push(a);
    if(starts.length+cityStarts.length+contains.length>60) break;
  }
  return [...starts,...cityStarts,...contains].slice(0,8);
}

function AirportField({v,on}){
  const [text,setText]=useState(v||"");
  const [openList,setOpenList]=useState(false);
  const boxRef=useRef(null);
  useEffect(()=>{ setText(v||""); },[v]);              // external changes (e.g. saved form)
  const hits=useMemo(()=>openList?searchAirports(text):[],[text,openList]);
  const pick=(a)=>{ on(a[0]); setText(a[0]); setOpenList(false); };
  return (
    <div ref={boxRef} style={{position:"relative"}}>
      <input value={text} placeholder="city or code"
        onChange={e=>{ setText(e.target.value); setOpenList(true); }}
        onFocus={()=>{ setOpenList(true); }}
        onBlur={()=>setTimeout(()=>{
          setOpenList(false);
          const t=text.trim().toUpperCase();
          if(/^[A-Z]{3}$/.test(t)&&AIRPORTS.some(a=>a[0]===t)){ if(t!==v) on(t); setText(t); }
          else setText(v||"");                              // don't let free text masquerade as a code
        },150)}  // let taps on the list land first
        onKeyDown={e=>{ if(e.key==="Enter"&&hits.length){ e.preventDefault(); pick(hits[0]); } }}
        style={{fontFamily:mono,fontSize:14,padding:"8px 10px",border:`1px solid ${HAIR}`,borderRadius:6,
          width:120,background:SURFACE,color:INK}}/>
      {openList&&hits.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,zIndex:30,marginTop:4,minWidth:260,maxWidth:"78vw",
          background:SURFACE,border:`1px solid ${HAIR}`,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",overflow:"hidden"}}>
          {hits.map(a=>(
            <div key={a[0]} onMouseDown={e=>{ e.preventDefault(); pick(a); }}
              style={{padding:"9px 12px",cursor:"pointer",borderBottom:`1px solid ${HAIR}`}}>
              <span style={{fontFamily:mono,fontWeight:800,fontSize:13}}>{a[0]}</span>
              <span style={{fontSize:12.5,marginLeft:8}}>{a[2]?`${a[2]} — `:""}{a[1]}</span>
              <span style={{fontFamily:mono,fontSize:10,color:MUTED,marginLeft:6}}>{a[3]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* TripOptimizer — front-end over the orchestrator engine (server.js / POST /optimize).
   In this preview it can't reach your localhost backend, so it shows a labelled SAMPLE.
   Set API_BASE to your deployed engine to go live. */

const API_BASE = ""; // same origin — server serves UI + API

const INK="#15181E", MUTED="#6B7280", HAIR="#DCDFE4", PAPER="#E9EBEE", SURFACE="#FFFFFF";
const PRIMARY="#2E2BD6", BEST="#B45309", POS="#0B7A4B";
const mono='"SF Mono","JetBrains Mono","Roboto Mono",Menlo,monospace';
const sans='"Inter",system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif';

const cad=(n)=>"$"+Math.round(n).toLocaleString("en-CA");
const fmt=(n)=>Math.round(n).toLocaleString("en-CA");

// Labelled sample so the preview renders the real output shape (NOT live data).
const SAMPLE = {
  best: { dep:"2026-08-02", ret:"2026-08-12", winner:"award", bestEcon:328,
    cash:{ price:1430, taxes:360, currency:"CAD" },
    award:{ econ:328, totalPts:13848, outOfPocket:120, cppCaptured:6.86,
      draws:{ "RBC Avion":13848 },
      outLeg:{ program:"BA Avios", points:9000, source:"RBC Avion", via:"transfer +30%", sourcePts:6924, taxes:60, estimated:true },
      inLeg:{ program:"BA Avios", points:9000, source:"RBC Avion", via:"transfer +30%", sourcePts:6924, taxes:60, estimated:true } } },
  grid: buildSampleGrid(),
  cashCalls:25, aviosNote:"off-peak economy estimate; confirm on ba.com",
};
function buildSampleGrid(){
  const deps=["2026-08-02","2026-08-03","2026-08-04"], rets=["2026-08-12","2026-08-13","2026-08-14"];
  const g=[]; deps.forEach((dep,i)=>rets.forEach((ret,j)=>{
    const econ=328+ (i*18) + (j*14) + (i===0&&j===0?0:6);
    g.push({dep,ret,winner: econ<900?"award":"cash", bestEcon:econ, cash:{price:1430+i*40+j*30}});
  })); return g;
}

const FORM_KEY="travelsmart_search_v1";
const FORM_DEFAULTS={ origin:"YYZ", destination:"MCO", depart:"2026-08-04", return:"2026-08-14",
  flexDays:2, cabin:"economy", adults:2, children:2 };

function loadForm(){
  try{
    const saved=JSON.parse(localStorage.getItem(FORM_KEY));
    if(!saved || typeof saved!=="object") return FORM_DEFAULTS;
    const f={...FORM_DEFAULTS, ...saved};
    // Stale-date guard: never pre-fill a departure in the past.
    const today=new Date().toISOString().slice(0,10);
    if(f.depart<today){ f.depart=FORM_DEFAULTS.depart>today?FORM_DEFAULTS.depart:today; f.return=""; }
    if(f.return && f.return<f.depart) f.return=f.depart;
    return f;
  }catch{ return FORM_DEFAULTS; }
}

export default function TripOptimizer(){
  const [form,setForm]=useState(loadForm);
  useEffect(()=>{ try{ localStorage.setItem(FORM_KEY, JSON.stringify(form)); }catch{} },[form]);
  const [balances,setBalances]=useState([
    {program:"Amex MR (CA)", amount:95000, value:1.7},
    {program:"Aeroplan", amount:42000, value:1.5},
    {program:"RBC Avion", amount:80000, value:1.5},
    {program:"BA Avios", amount:30000, value:1.7},
  ]);
  const [mode,setMode]=useState("cash"); // "cash" = all flights, cash price · "optimize" = points engine
  const [state,setState]=useState({status:"idle", kind:null, data:null, sample:false, err:null});

  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updBal=(i,k,v)=>setBalances(b=>b.map((x,j)=>j===i?{...x,[k]:v}:x));

  // Pull the server's actual error message out of a failed response, not just the status code.
  async function errText(res){
    try{ const j=await res.json(); return `engine ${res.status}${j.error?` — ${j.error}`:""}`; }
    catch{ return `engine ${res.status}`; }
  }

  async function runCash(){
    setState({status:"loading", kind:"flights", data:null, sample:false, err:null});
    const body={ origin:form.origin, destination:form.destination,
      departureDate:form.depart, returnDate:form.return,
      adults:Number(form.adults), children:Number(form.children), travelClass:form.cabin };
    try{
      const res=await fetch(`${API_BASE}/flights`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      if(!res.ok) throw new Error(await errText(res));
      setState({status:"done", kind:"flights", data:await res.json(), sample:false, err:null});
    }catch(e){
      setState({status:"done", kind:"flights", data:null, sample:false, err:e.message});
    }
  }

  async function run(){
    if(mode==="cash") return runCash();
    setState({status:"loading", kind:"optimize", data:null, sample:false, err:null});
    const cfg={ origin:form.origin, destination:form.destination,
      target:{depart:form.depart, return:form.return}, flexDays:Number(form.flexDays),
      party:{adults:Number(form.adults), children:Number(form.children)}, cabin:form.cabin,
      sources:["aeroplan","flyingblue","american"],
      balances:Object.fromEntries(balances.map(b=>[b.program,Number(b.amount)])),
      valuations:Object.fromEntries(balances.map(b=>[b.program,Number(b.value)])),
      aviosDistance:1187, awardTax:{Aeroplan:80,"Flying Blue":90,American:50,"BA Avios":60},
      asOf:new Date().toISOString().slice(0,10) };
    try{
      const res=await fetch(`${API_BASE}/optimize`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(cfg)});
      if(!res.ok) throw new Error(await errText(res));
      setState({status:"done", kind:"optimize", data:await res.json(), sample:false, err:null});
    }catch(e){
      setState({status:"done", kind:"optimize", data:SAMPLE, sample:true, err:e.message});
    }
  }

  return (
    <div style={{background:PAPER,color:INK,fontFamily:sans,minHeight:"100%",padding:"24px 16px 60px"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{borderBottom:`2px solid ${INK}`,paddingBottom:12}}>
          <div style={{fontFamily:mono,fontSize:11,letterSpacing:"0.18em",color:MUTED,textTransform:"uppercase"}}>
            Cross-program award optimizer
          </div>
          <h1 style={{fontSize:28,fontWeight:800,letterSpacing:"-0.02em",margin:"6px 0 0"}}>
            Cheapest way to fly, points included
          </h1>
        </div>

        {/* mode toggle */}
        <div style={{display:"flex",gap:8,marginTop:18}}>
          {[["cash","Cash flights"],["optimize","Points optimizer"]].map(([k,label])=>(
            <button key={k} onClick={()=>setMode(k)}
              style={{fontFamily:mono,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",
                padding:"7px 14px",borderRadius:6,cursor:"pointer",fontWeight:700,
                border:`1px solid ${mode===k?PRIMARY:HAIR}`,
                background:mode===k?PRIMARY:SURFACE,color:mode===k?"#fff":MUTED}}>
              {label}
            </button>
          ))}
        </div>

        {/* form */}
        <div style={{display:"flex",flexWrap:"wrap",gap:16,margin:"20px 0"}}>
          <Panel title="Trip">
            <Row><Field label="From"><AirportField v={form.origin} on={v=>upd("origin",v)}/></Field>
              <Field label="To"><AirportField v={form.destination} on={v=>upd("destination",v)}/></Field>
              <Field label="Cabin"><Sel v={form.cabin} on={v=>upd("cabin",v)} opts={["economy","business"]}/></Field></Row>
            <Row><Field label="Depart"><In type="date" v={form.depart} on={v=>upd("depart",v)} w={140}/></Field>
              <Field label="Return"><In type="date" v={form.return} on={v=>upd("return",v)} w={140}/></Field></Row>
            <Row>{mode==="optimize" && <Field label="Flex ±days"><Sel v={form.flexDays} on={v=>upd("flexDays",v)} opts={["0","1","2","3"]}/></Field>}
              <Field label="Adults"><In type="number" v={form.adults} on={v=>upd("adults",v)} w={56}/></Field>
              <Field label="Children"><In type="number" v={form.children} on={v=>upd("children",v)} w={56}/></Field></Row>
            {mode==="cash" && (
              <button onClick={run} style={{marginTop:10,width:"100%",background:PRIMARY,color:"#fff",border:"none",
                borderRadius:6,padding:"11px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:sans}}>
                {state.status==="loading"?"Searching…":"Show all flights"}
              </button>
            )}
          </Panel>
          {mode==="optimize" && (
          <Panel title="Your balances" sub="program · points · ¢/pt">
            {balances.map((b,i)=>(
              <Row key={i}>
                <In v={b.program} on={v=>updBal(i,"program",v)} flex={2} bold/>
                <In type="number" v={b.amount} on={v=>updBal(i,"amount",v)} flex={1.4} m right/>
                <In type="number" step="0.1" v={b.value} on={v=>updBal(i,"value",v)} w={52} m right/>
              </Row>
            ))}
            <button onClick={run} style={{marginTop:10,width:"100%",background:PRIMARY,color:"#fff",border:"none",
              borderRadius:6,padding:"11px 0",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:sans}}>
              {state.status==="loading"?"Searching…":"Find cheapest"}
            </button>
          </Panel>
          )}
        </div>

        {state.sample && (
          <Banner color={BEST} bg="#FBF3E7" bd="#EAD9BD">
            Showing SAMPLE output — couldn't reach the engine at {API_BASE} ({state.err}). Run server.js locally or point API_BASE at your deploy.
          </Banner>
        )}
        {state.kind==="flights" && state.err && (
          <Banner color="#B42318" bg="#FEF0EF" bd="#F3C4C0">
            Flight search failed ({state.err}). Check DUFFEL_TOKEN on the server.
          </Banner>
        )}

        {state.kind==="flights" && state.data && <FlightList r={state.data} form={form}/>}
        {state.kind==="optimize" && state.data && <Results r={state.data} balances={balances}/>}
        {state.status==="idle" && <Empty/>}
      </div>
    </div>
  );
}

// ---- Cash mode: render every offer the engine returned, cheapest first ----
const hhmm=(iso)=>iso?iso.slice(11,16):"—";
const dur=(d)=>{ if(!d) return ""; const m=d.match(/PT(?:(\d+)H)?(?:(\d+)M)?/); if(!m) return d;
  return `${m[1]?m[1]+"h ":""}${m[2]?m[2]+"m":""}`.trim(); };
const AIRLINES={AC:"Air Canada",WS:"WestJet",TS:"Air Transat",PD:"Porter",UA:"United",AA:"American",DL:"Delta",B6:"JetBlue",F8:"Flair",WG:"Sunwing",ZZ:"Duffel Airways (test)",ZX:"Duffel Airways (test)"};
const airline=(c)=>AIRLINES[c]||c||"—";

// City lookup from the airports dataset: "PHL" → "Philadelphia"
const CITY=new Map(AIRPORTS.map(a=>[a[0],a[2]||a[1]]));
const cityOf=(code)=>CITY.get(code)||code;
// Minutes between two ISO timestamps → "2h 39m"
const gapDur=(a,b)=>{ if(!a||!b) return null; const m=Math.round((new Date(b)-new Date(a))/60000);
  if(!(m>0)) return null; return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`; };

function Slice({s,label}){
  const segs=s.segments||[];
  const first=segs[0]||{}, last=segs[segs.length-1]||{};
  const lays=segs.slice(1).map((g,k)=>({at:g.from, len:gapDur(segs[k].arrive,g.depart)}));
  return (
    <div style={{flex:1,minWidth:230}}>
      <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontWeight:700,fontSize:15,marginTop:3}}>
        {hhmm(first.depart)} {first.from} → {hhmm(last.arrive)} {last.to}
      </div>
      <div style={{fontFamily:mono,fontSize:11.5,color:MUTED,marginTop:2}}>
        {dur(s.duration)} total · {s.stops===0?"nonstop":`${s.stops} stop${s.stops>1?"s":""}`} · {segs.map(g=>`${g.carrier}${g.number||""}`).join(" · ")}
      </div>
      {lays.length>0 && (
        <div style={{fontFamily:mono,fontSize:10.5,color:MUTED,marginTop:1}}>
          {lays.map(l=>`${l.len||"—"} in ${cityOf(l.at)} (${l.at})`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function FlightList({r,form}){
  const offers=r.offers||[];
  const pax=(Number(form.adults)||0)+(Number(form.children)||0)||1;
  const age=r._cacheAgeMs>60000?`cached ${Math.round(r._cacheAgeMs/60000)} min ago`:"live";
  const [open,setOpen]=useState(null); // index of expanded card
  const toggle=(i)=>setOpen(o=>o===i?null:i);
  if(!offers.length) return (
    <Banner color={BEST} bg="#FBF3E7" bd="#EAD9BD">
      No offers returned{r.note?` — ${r.note}`:""}. ULCCs (e.g. Flair) aren't in the feed — check them directly.
    </Banner>
  );
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:8,margin:"4px 0 12px"}}>
        <h2 style={{fontSize:12,fontFamily:mono,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,margin:0}}>
          {offers.length} option{offers.length!==1?"s":""} · {form.origin} ⇄ {form.destination} · total for {pax} traveller{pax>1?"s":""}
        </h2>
        <span style={{fontFamily:mono,fontSize:10,color:MUTED}}>{age} · {r.currency}</span>
      </div>
      {offers.map((o,i)=>(
        <div key={i} role="button" tabIndex={0} aria-expanded={open===i}
          onClick={()=>toggle(i)}
          onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(i); } }}
          style={{background:SURFACE,border:`1px solid ${i===0?BEST:HAIR}`,cursor:"pointer",
          borderLeft:`4px solid ${i===0?BEST:HAIR}`,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,alignItems:"flex-start"}}>
            <div style={{flex:"1 1 240px",minWidth:240}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                {i===0 && <span style={{fontFamily:mono,fontSize:9,letterSpacing:"0.1em",color:"#fff",background:BEST,padding:"2px 6px",borderRadius:3}}>CHEAPEST</span>}
                <span style={{fontWeight:800,fontSize:15}}>{airline(o.validatingAirlines?.[0])}</span>
                {o.cabin && <span style={{fontFamily:mono,fontSize:10,color:MUTED}}>{o.cabin.replace("_"," ")}</span>}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:16,marginTop:10}}>
                {(o.itineraries||[]).map((s,j)=>(
                  <Slice key={j} s={s} label={j===0?"Outbound":"Return"}/>
                ))}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:"auto"}}>
              <div style={{fontFamily:mono,fontSize:24,fontWeight:800,color:i===0?POS:INK}}>{cad(o.price)}</div>
              <div style={{fontFamily:mono,fontSize:11,color:MUTED,whiteSpace:"nowrap"}}>{cad(o.price/pax)}/person · taxes {cad(o.taxes)}</div>
              <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,marginTop:4,textTransform:"uppercase"}}>
                {open===i?"▴ hide details":"▾ details"}
              </div>
            </div>
          </div>
          {open===i && <OfferDetail o={o} form={form}/>}
        </div>
      ))}
      <p style={{color:MUTED,fontSize:12,marginTop:12,lineHeight:1.6}}>
        Prices are all-in for the whole party from the Duffel feed. ULCCs like Flair aren't included — worth a direct check before booking.
      </p>
    </div>
  );
}

function OfferDetail({o,form}){
  const gfq=`Flights from ${form.origin} to ${form.destination} on ${form.depart}${form.return?` through ${form.return}`:""}`;
  const gfUrl=`https://www.google.com/travel/flights?q=${encodeURIComponent(gfq)}`;
  const conds=[
    o.conditions?.change && {label:"Changes", c:o.conditions.change},
    o.conditions?.refund && {label:"Refund", c:o.conditions.refund},
  ].filter(Boolean);
  return (
    <div onClick={e=>e.stopPropagation()} style={{borderTop:`1px solid ${HAIR}`,marginTop:12,paddingTop:12,cursor:"default"}}>
      {(o.itineraries||[]).map((s,j)=>(
        <div key={j} style={{marginBottom:12}}>
          <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>
            {j===0?"Outbound":"Return"}{s.fareBrand?` · ${s.fareBrand}`:""}
          </div>
          {(s.segments||[]).map((g,k)=>(
            <React.Fragment key={k}>
              {k>0 && (
                <div style={{fontFamily:mono,fontSize:10.5,color:BEST,margin:"4px 0 4px 10px"}}>
                  ⟳ {gapDur(s.segments[k-1].arrive,g.depart)||"—"} layover in {cityOf(g.from)} ({g.from})
                </div>
              )}
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px 14px",alignItems:"baseline",marginTop:4}}>
                <span style={{fontFamily:mono,fontSize:12,fontWeight:700,minWidth:118}}>
                  {hhmm(g.depart)} {g.from} → {hhmm(g.arrive)} {g.to}
                </span>
                <span style={{fontFamily:mono,fontSize:11,color:MUTED}}>
                  {(g.marketing||g.carrier)||""}{g.marketingNumber||g.number||""}
                  {g.carrierName?` · ${g.carrierName}`:""}
                  {g.aircraft?` · ${g.aircraft}`:""}
                  {g.duration?` · ${dur(g.duration)}`:""}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      ))}
      <div style={{display:"flex",flexWrap:"wrap",gap:"4px 18px",fontFamily:mono,fontSize:11,color:MUTED}}>
        <span>bags: {o.baggage?.carryOn??0} carry-on · {o.baggage?.checked??0} checked <span style={{fontSize:9}}>(per person)</span></span>
        {conds.map(({label,c},k)=>(
          <span key={k}>{label}: {c.allowed?(c.penalty!=null?`fee ${cad(c.penalty)}`:"allowed"):"not allowed"}</span>
        ))}
        {o.ownerName && <span>sold by {o.ownerName}</span>}
      </div>
      <a href={gfUrl} target="_blank" rel="noopener noreferrer"
        style={{display:"inline-block",marginTop:10,fontFamily:mono,fontSize:11,fontWeight:700,letterSpacing:"0.06em",
          color:PRIMARY,border:`1px solid ${PRIMARY}`,borderRadius:6,padding:"6px 12px",textDecoration:"none"}}>
        Check on Google Flights ↗
      </a>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:8}}>
        Fare rules come from the airline via Duffel — confirm on the airline's site before booking.
      </div>
    </div>
  );
}

function Results({r,balances}){
  const b=r.best, aw=b.award, cashWins=b.winner==="cash";
  const [sel,setSel]=useState(null); // "dep|ret" of tapped cell
  const selCell=sel?r.grid.find(g=>g.dep+"|"+g.ret===sel):null;
  return (
    <div>
      {/* headline */}
      <div style={{background:SURFACE,border:`1px solid ${BEST}`,borderLeft:`4px solid ${BEST}`,borderRadius:10,padding:18,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,alignItems:"baseline"}}>
          <div>
            <span style={{fontFamily:mono,fontSize:10,letterSpacing:"0.12em",color:"#fff",background:BEST,padding:"2px 7px",borderRadius:3}}>CHEAPEST</span>
            <div style={{fontSize:22,fontWeight:800,marginTop:8}}>{b.dep} → {b.ret}</div>
            <div style={{color:MUTED,fontSize:13,marginTop:2}}>
              {cashWins?"Pay cash":"Use points"} · cash if paid {cad(b.cash.price)}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:mono,fontSize:28,fontWeight:800,color:cashWins?INK:POS}}>
              {cashWins?cad(b.cash.price):cad(aw.outOfPocket)}
              {!cashWins && <span style={{fontSize:13,color:MUTED,fontWeight:600}}> + {fmt(aw.totalPts)} pts</span>}
            </div>
            {!cashWins && <div style={{fontFamily:mono,fontSize:12,color:POS}}>{aw.cppCaptured.toFixed(2)} ¢/pt captured</div>}
          </div>
        </div>
        {!cashWins && (
          <div style={{marginTop:14,borderTop:`1px solid ${HAIR}`,paddingTop:12,display:"flex",flexWrap:"wrap",gap:18}}>
            <Leg dir="Outbound" l={aw.outLeg}/><Leg dir="Return" l={aw.inLeg}/>
            <div style={{fontFamily:mono,fontSize:11,color:MUTED,alignSelf:"flex-end"}}>
              draws: {Object.entries(aw.draws).map(([k,v])=>`${k} ${fmt(v)}`).join(" · ")}
            </div>
          </div>
        )}
      </div>

      <Matrix grid={r.grid} sel={sel} onSel={(k)=>setSel(s=>s===k?null:k)}/>
      {selCell
        ? <PairDetail g={selCell} balances={balances}/>
        : <div style={{fontFamily:mono,fontSize:11,color:MUTED,marginTop:10}}>Tap any date pair for the cash-vs-points breakdown.</div>}

      <p style={{color:MUTED,fontSize:12,marginTop:16,lineHeight:1.6}}>
        <strong style={{color:INK}}>Read the flags.</strong> <span style={{color:BEST}}>[est]</span> marks the distance-based Avios price Seats.aero can't see — {r.aviosNote}. Verify award space before transferring; transfers are irreversible. Cash sweep used {r.cashCalls} searches.
      </p>
    </div>
  );
}

// ---- Tapped-cell breakdown: cash vs points for one date pair, always both sides ----
function PairDetail({g,balances}){
  const ref=g.award||g.awardRef;                 // feasible solve, else unconstrained reference
  const feasible=!!g.award;
  const bal=Object.fromEntries((balances||[]).map(b=>[b.program,Number(b.amount)||0]));
  const shorts=ref&&!feasible
    ? Object.entries(ref.draws).map(([src,need])=>({src,need,have:bal[src]??0,short:Math.max(0,need-(bal[src]??0))})).filter(s=>s.short>0)
    : [];
  const cashWins=g.winner==="cash";
  const col={flex:"1 1 220px",minWidth:220,background:SURFACE,border:`1px solid ${HAIR}`,borderRadius:8,padding:"12px 14px"};
  return (
    <div style={{marginTop:12}}>
      <div style={{fontFamily:mono,fontSize:11,letterSpacing:"0.1em",color:MUTED,textTransform:"uppercase",marginBottom:8}}>
        {g.dep} → {g.ret}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        <div style={{...col,borderColor:cashWins?POS:HAIR,borderLeft:`4px solid ${cashWins?POS:HAIR}`}}>
          <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>Cash{cashWins?" · winner":""}</div>
          <div style={{fontFamily:mono,fontSize:22,fontWeight:800,marginTop:4}}>{cad(g.cash.price)}</div>
          <div style={{fontFamily:mono,fontSize:11,color:MUTED}}>whole party, all-in{g.cash.taxes?` · taxes ${cad(g.cash.taxes)}`:""}</div>
        </div>
        <div style={{...col,borderColor:!cashWins?POS:HAIR,borderLeft:`4px solid ${!cashWins?POS:HAIR}`}}>
          <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>
            Points{!cashWins?" · winner":""}{!feasible&&ref?" · not enough points":""}
          </div>
          {ref?(
            <>
              <div style={{fontFamily:mono,fontSize:22,fontWeight:800,marginTop:4,color:feasible?INK:MUTED}}>
                {fmt(ref.totalPts)} pts <span style={{fontSize:13,fontWeight:600,color:MUTED}}>+ {cad(ref.outOfPocket)} taxes</span>
              </div>
              <div style={{fontFamily:mono,fontSize:11,color:MUTED,marginTop:4,lineHeight:1.7}}>
                out: {ref.outLeg.program}{ref.outLeg.estimated?" [est]":""} {fmt(ref.outLeg.sourcePts)} via {ref.outLeg.source}<br/>
                ret: {ref.inLeg.program}{ref.inLeg.estimated?" [est]":""} {fmt(ref.inLeg.sourcePts)} via {ref.inLeg.source}
                {g.award&&<><br/>value captured: {g.award.cppCaptured.toFixed(2)} ¢/pt</>}
              </div>
              {shorts.length>0&&(
                <div style={{fontFamily:mono,fontSize:11,color:BEST,marginTop:6}}>
                  {shorts.map(s=>`short ${fmt(s.short)} on ${s.src} (have ${fmt(s.have)})`).join(" · ")}
                </div>
              )}
            </>
          ):(
            <div style={{fontFamily:mono,fontSize:12,color:MUTED,marginTop:6}}>No award space found for this pair.</div>
          )}
        </div>
      </div>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:8}}>
        Points are for all travellers. Programs don't let you split one ticket between points and cash here — it's one or the other per ticket (taxes are always cash).
      </div>
    </div>
  );
}

function Leg({dir,l}){
  return (
    <div style={{minWidth:180}}>
      <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>{dir}</div>
      <div style={{fontWeight:700,fontSize:14,marginTop:3}}>
        {l.program} {l.estimated && <span style={{color:BEST,fontSize:11}}>[est]</span>}
      </div>
      <div style={{fontFamily:mono,fontSize:12,color:MUTED,marginTop:2}}>
        {fmt(l.points)} via {l.source} ({l.via}) → {fmt(l.sourcePts)} pts
      </div>
    </div>
  );
}

function Matrix({grid,sel,onSel}){
  const deps=[...new Set(grid.map(g=>g.dep))].sort();
  const rets=[...new Set(grid.map(g=>g.ret))].sort();
  const by={}; grid.forEach(g=>by[g.dep+"|"+g.ret]=g);
  const econs=grid.map(g=>g.bestEcon); const lo=Math.min(...econs), hi=Math.max(...econs);
  const best=grid.reduce((m,g)=>g.bestEcon<m.bestEcon?g:m,grid[0]);
  const shade=(e)=>{ const t=hi===lo?0:(e-lo)/(hi-lo); // green(cheap)->paper(dear)
    const g=Math.round(11+t*(233-11)), r=Math.round(122+t*(233-122)); return `rgb(${r},${Math.round(122+t*111)},${Math.round(75+t*158)})`; };
  return (
    <div>
      <h2 style={{fontSize:12,fontFamily:mono,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,margin:"0 0 10px"}}>
        Flex window · cheapest per date pair
      </h2>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",fontFamily:mono,fontSize:12}}>
          <thead><tr><th style={{padding:"4px 8px"}}></th>
            {rets.map(r=><th key={r} style={{padding:"4px 8px",color:MUTED,fontWeight:600}}>{r.slice(5)}</th>)}</tr></thead>
          <tbody>
            {deps.map(dep=>(
              <tr key={dep}>
                <td style={{padding:"4px 8px",color:MUTED}}>{dep.slice(5)}</td>
                {rets.map(ret=>{ const g=by[dep+"|"+ret]; if(!g) return <td key={ret}/>;
                  const key=dep+"|"+ret, isBest=g===best, isSel=sel===key;
                  return (
                    <td key={ret} style={{padding:2}}>
                      <div role="button" tabIndex={0} onClick={()=>onSel(key)}
                        onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); onSel(key); } }}
                        title={`${g.winner}`} style={{background:shade(g.bestEcon),color:"#fff",cursor:"pointer",
                        padding:"7px 9px",borderRadius:4,textAlign:"center",fontWeight:700,
                        outline:isSel?`2px solid ${PRIMARY}`:isBest?`2px solid ${BEST}`:"none",outlineOffset:1,position:"relative"}}>
                        {cad(g.bestEcon)}
                        <span style={{position:"absolute",top:2,right:3,fontSize:8,opacity:0.85}}>{g.winner==="award"?"◆":"$"}</span>
                      </div>
                    </td>
                  );})}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:6}}>◆ points · $ cash · amber ring = cheapest · blue ring = selected · greener = cheaper · tap a cell for details</div>
    </div>
  );
}

const Empty=()=> <div style={{textAlign:"center",color:MUTED,padding:"48px 0",fontSize:14}}>Enter a trip and your balances, then find the cheapest combination.</div>;
function Banner({children,color,bg,bd}){ return <div style={{fontFamily:mono,fontSize:11.5,color,background:bg,border:`1px solid ${bd}`,padding:"8px 12px",borderRadius:6,marginBottom:16}}>{children}</div>; }
function Panel({title,sub,children}){ return (
  <div style={{flex:1,minWidth:300,background:SURFACE,border:`1px solid ${HAIR}`,borderRadius:8,padding:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
      <span style={{fontWeight:700,fontSize:15}}>{title}</span>
      {sub&&<span style={{fontFamily:mono,fontSize:10,color:MUTED}}>{sub}</span>}
    </div>{children}
  </div> ); }
const Row=({children})=> <div style={{display:"flex",gap:6,marginBottom:8,alignItems:"flex-end",flexWrap:"wrap"}}>{children}</div>;
function Field({label,children}){ return <label style={{display:"flex",flexDirection:"column",gap:3}}>
  <span style={{fontFamily:mono,fontSize:9,letterSpacing:"0.06em",color:MUTED,textTransform:"uppercase"}}>{label}</span>{children}</label>; }
function In({v,on,type="text",w,flex,m,right,bold,step}){ return (
  <input type={type} value={v} step={step} onChange={e=>on(e.target.value)}
    style={{border:`1px solid ${HAIR}`,background:SURFACE,borderRadius:4,padding:"7px 8px",fontSize:13,color:INK,
      outline:"none",width:w,flex,minWidth:0,fontFamily:m?mono:sans,textAlign:right?"right":"left",fontWeight:bold?600:400}}/> ); }
function Sel({v,on,opts}){ return (
  <select value={v} onChange={e=>on(e.target.value)}
    style={{border:`1px solid ${HAIR}`,background:SURFACE,borderRadius:4,padding:"7px 8px",fontSize:13,color:INK,fontFamily:sans}}>
    {opts.map(o=><option key={o} value={o}>{o}</option>)}</select> ); }
