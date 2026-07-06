import React, { useState, useMemo, useEffect } from "react";

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
            <Row><Field label="From"><In v={form.origin} on={v=>upd("origin",v.toUpperCase())} w={64}/></Field>
              <Field label="To"><In v={form.destination} on={v=>upd("destination",v.toUpperCase())} w={64}/></Field>
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
        {state.kind==="optimize" && state.data && <Results r={state.data}/>}
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

function Slice({s,label}){
  const segs=s.segments||[];
  const first=segs[0]||{}, last=segs[segs.length-1]||{};
  return (
    <div style={{flex:1,minWidth:230}}>
      <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>{label}</div>
      <div style={{fontWeight:700,fontSize:15,marginTop:3}}>
        {hhmm(first.depart)} {first.from} → {hhmm(last.arrive)} {last.to}
      </div>
      <div style={{fontFamily:mono,fontSize:11.5,color:MUTED,marginTop:2}}>
        {dur(s.duration)} · {s.stops===0?"nonstop":`${s.stops} stop${s.stops>1?"s":""}`} · {segs.map(g=>`${g.carrier}${g.number||""}`).join(" · ")}
      </div>
      {s.stops>0 && (
        <div style={{fontFamily:mono,fontSize:10.5,color:MUTED,marginTop:1}}>
          via {segs.slice(0,-1).map(g=>g.to).join(", ")}
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
          {open===i && <OfferDetail o={o}/>}
        </div>
      ))}
      <p style={{color:MUTED,fontSize:12,marginTop:12,lineHeight:1.6}}>
        Prices are all-in for the whole party from the Duffel feed. ULCCs like Flair aren't included — worth a direct check before booking.
      </p>
    </div>
  );
}

// ---- Expanded detail panel: segment-by-segment with layovers, baggage, fare rules ----
const layover=(a,b)=>{ // arrive ISO of prev seg, depart ISO of next seg → "1h 46m"
  if(!a||!b) return null;
  const m=Math.round((new Date(b)-new Date(a))/60000);
  if(!(m>0)) return null;
  return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`;
};

function OfferDetail({o}){
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
                  ⟳ {layover(s.segments[k-1].arrive,g.depart)||"—"} layover in {g.from}
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
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:8}}>
        Fare rules come from the airline via Duffel — confirm on the airline's site before booking.
      </div>
    </div>
  );
}

function Results({r}){
  const b=r.best, aw=b.award, cashWins=b.winner==="cash";
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

      <Matrix grid={r.grid}/>

      <p style={{color:MUTED,fontSize:12,marginTop:16,lineHeight:1.6}}>
        <strong style={{color:INK}}>Read the flags.</strong> <span style={{color:BEST}}>[est]</span> marks the distance-based Avios price Seats.aero can't see — {r.aviosNote}. Verify award space before transferring; transfers are irreversible. Cash sweep used {r.cashCalls} searches.
      </p>
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

function Matrix({grid}){
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
                  const isBest=g===best;
                  return (
                    <td key={ret} style={{padding:2}}>
                      <div title={`${g.winner}`} style={{background:shade(g.bestEcon),color:"#fff",
                        padding:"7px 9px",borderRadius:4,textAlign:"center",fontWeight:700,
                        outline:isBest?`2px solid ${BEST}`:"none",outlineOffset:1,position:"relative"}}>
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
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:6}}>◆ points · $ cash · amber ring = cheapest · greener = cheaper</div>
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
