import React, { useState, useMemo, useEffect, useRef } from "react";
import { AIRPORTS } from "./airports";

const API_BASE = ""; // same origin — server serves UI + API

// Palette lives in CSS variables so light/dark can swap at runtime (and follow the OS in auto).
const INK="var(--ink)", MUTED="var(--muted)", HAIR="var(--hair)", PAPER="var(--paper)", SURFACE="var(--surface)";
const PRIMARY="var(--primary)", BEST="var(--best)", POS="var(--pos)", DANGER="var(--danger)";
const LIGHT_VARS=`--paper:#E9EBEE;--surface:#FFFFFF;--ink:#15181E;--muted:#6B7280;--hair:#DCDFE4;
  --primary:#2E2BD6;--best:#B45309;--pos:#0B7A4B;--danger:#B42318;
  --warn-bg:#FBF3E7;--warn-bd:#EAD9BD;--err-bg:#FEF0EF;--err-bd:#F3C4C0;`;
const DARK_VARS=`--paper:#0F1115;--surface:#1A1E25;--ink:#E7EAEF;--muted:#98A1AD;--hair:#2C323C;
  --primary:#7B78FF;--best:#E09A4A;--pos:#3ECF8E;--danger:#FF6B5E;
  --warn-bg:#2A2416;--warn-bd:#4A3B1F;--err-bg:#2A1715;--err-bd:#553029;`;
const THEME_CSS=`
:root{${LIGHT_VARS}}
[data-theme="dark"]{${DARK_VARS}}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){${DARK_VARS}} }
html,body{margin:0;background:var(--paper);}
body,input,select,button{transition:background-color 0.15s,color 0.15s,border-color 0.15s;}
@keyframes ts-spin{to{transform:rotate(360deg)}}
.ts-spin{display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,0.35);
  border-top-color:#fff;border-radius:50%;animation:ts-spin 0.7s linear infinite;
  vertical-align:-2px;margin-right:8px;}
input,select{color-scheme:light dark;}
`;
const mono='"SF Mono","JetBrains Mono","Roboto Mono",Menlo,monospace';
const sans='"Inter",system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif';

const cad=(n)=>"$"+Math.round(n).toLocaleString("en-CA");
const fmt=(n)=>Math.round(n).toLocaleString("en-CA");
// Duffel quotes in the account's billing currency — label anything non-CAD honestly.
const money=(n,cur)=>(cur==="USD"?"US$":cur&&cur!=="CAD"?cur+" ":"$")+Math.round(n).toLocaleString("en-CA");

// ---- "Points needed by program" — every program's price for this pair, funded or not ----
function ByProgram({rows,balances,cur}){
  if(!rows?.length) return null;
  return (
    <div style={{marginTop:14,borderTop:`1px solid ${HAIR}`,paddingTop:12}}>
      <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase",marginBottom:8}}>
        Points needed by program · whole party · round trip
      </div>
      {rows.map((p)=>(
        <div key={p.program} style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",
          padding:"7px 0",borderBottom:`1px solid ${PAPER}`}}>
          <div style={{minWidth:150}}>
            <span style={{fontWeight:700,fontSize:13.5}}>{p.program}</span>
            {p.estimated&&<span style={{fontFamily:mono,fontSize:10,color:BEST}}> [est]</span>}
            {p.funding&&(
              <div style={{fontFamily:mono,fontSize:10.5,color:MUTED,marginTop:1}}>
                {p.funding.source===p.program?"from your balance":`${fmt(p.funding.sourcePts)} via ${p.funding.source}${p.funding.via?` (${p.funding.via})`:""}`}
                {p.funding.short>0&&<span style={{color:DANGER,fontWeight:700}}> · short {fmt(p.funding.short)}</span>}
              </div>
            )}
          </div>
          <div style={{textAlign:"right",fontFamily:mono}}>
            {p.roundTrip?(
              <>
                <div style={{fontSize:15,fontWeight:800}}>{fmt(p.totalPts)} <span style={{fontSize:10,color:MUTED}}>pts</span></div>
                <div style={{fontSize:10.5,color:MUTED}}>{fmt(p.outPts)} out · {fmt(p.retPts)} ret · + {money(p.taxes,cur)} taxes</div>
              </>
            ):(
              <div style={{fontSize:11,color:MUTED,paddingTop:4}}>
                {p.outPts!=null?`outbound only · ${fmt(p.outPts)} pts`:`return only · ${fmt(p.retPts)} pts`}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

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

// ---- Award verification deep links. Aeroplan & AA accept parametric searches (formats
// used by award tools); the rest get their award-flow landing page. Always verify there
// before transferring anything.
function awardHref(program,{from,to,date,adults=1,children=0}){
  switch(program){
    case "Aeroplan":
      return `https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=${from}&dest0=${to}&departureDate0=${date}&ADT=${adults}&YTH=0&CHD=${children}&INF=0&marketCode=INT&tripType=O&lang=en-CA`;
    case "American":
      return `https://www.aa.com/booking/search?locale=en_US&pax=${adults+children}&adult=${adults}&child=${children}&type=OneWay&searchType=Award&slices=${encodeURIComponent(JSON.stringify([{orig:from,dest:to,date}]))}`;
    case "Flying Blue": return "https://wwws.airfrance.ca/search/offers?bookingFlow=REWARD";
    case "Qatar":       return "https://www.qatarairways.com/en/Privilege-Club/redeem-avios.html";
    case "BA Avios":    return "https://www.britishairways.com/travel/redeem/execclub/_gf/en_gb";
    default: return null;
  }
}
const VERIFY_STYLE={fontFamily:mono,fontSize:10,fontWeight:700,color:PRIMARY,textDecoration:"none",
  border:`1px solid ${PRIMARY}`,borderRadius:4,padding:"2px 7px",display:"inline-block",marginTop:4};

function AirportField({v,on}){
  const codes=String(v||"").split(",").filter(Boolean);
  const [text,setText]=useState("");
  const [openList,setOpenList]=useState(false);
  const hits=useMemo(()=>openList?searchAirports(text).filter(a=>!codes.includes(a[0])):[],[text,openList,v]);
  const commit=(list)=>on(list.join(","));
  const pick=(a)=>{ if(codes.length>=3) return; commit([...codes,a[0]]); setText(""); setOpenList(false); };
  const drop=(c)=>commit(codes.filter(x=>x!==c));
  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:4,padding:"4px 6px",
        border:`1px solid ${HAIR}`,borderRadius:6,background:SURFACE,minWidth:130,maxWidth:220}}>
        {codes.map(c=>(
          <span key={c} onClick={()=>drop(c)} title="tap to remove"
            style={{fontFamily:mono,fontSize:12,fontWeight:800,background:PAPER,border:`1px solid ${HAIR}`,
              borderRadius:4,padding:"2px 6px",cursor:"pointer"}}>
            {c} ×
          </span>
        ))}
        {codes.length<3&&(
          <input value={text} placeholder={codes.length?"+ add":"city or code"}
            onChange={e=>{ setText(e.target.value); setOpenList(true); }}
            onFocus={()=>setOpenList(true)}
            onBlur={()=>setTimeout(()=>{
              setOpenList(false);
              const t=text.trim().toUpperCase();
              if(/^[A-Z]{3}$/.test(t)&&AIRPORTS.some(a=>a[0]===t)&&!codes.includes(t)) commit([...codes,t]);
              setText("");                                    // don't let free text linger
            },150)}  // let taps on the list land first
            onKeyDown={e=>{ if(e.key==="Enter"&&hits.length){ e.preventDefault(); pick(hits[0]); }
              if(e.key==="Backspace"&&!text&&codes.length) drop(codes[codes.length-1]); }}
            style={{fontFamily:mono,fontSize:13,padding:"4px 2px",border:"none",outline:"none",
              width:codes.length?64:96,background:"transparent",color:INK}}/>
        )}
      </div>
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
      {codes.length>1&&<div style={{fontFamily:mono,fontSize:9,color:MUTED,marginTop:2}}>searches all {codes.length}</div>}
    </div>
  );
}

/* TripOptimizer — front-end over the orchestrator engine (server.js / POST /optimize).
   In this preview it can't reach your localhost backend, so it shows a labelled SAMPLE.
   Set API_BASE to your deployed engine to go live. */


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

// Loyalty programs the engine understands (names must match transferGraph/seatsAeroClient
// exactly — they're the join key for funding + award matching). value = default ¢/pt, editable.
const PROGRAMS=[
  ["Amex MR (CA)",1.7],["RBC Avion",1.5],["Aeroplan",1.5],["BA Avios",1.7],
  ["Flying Blue",1.4],["American",1.5],["WestJet",1.0],["United",1.3],
  ["Delta",1.2],["Alaska",1.6],["Qatar",1.4],
];
const PROG_DEFAULT_CPP=Object.fromEntries(PROGRAMS);
const BAL_KEY="ts_balances_v1";
const BAL_DEFAULTS=[
  {program:"Amex MR (CA)", amount:95000, value:1.7},
  {program:"Aeroplan", amount:42000, value:1.5},
  {program:"RBC Avion", amount:80000, value:1.5},
  {program:"BA Avios", amount:30000, value:1.7},
];
function loadBalances(){
  try{
    const saved=JSON.parse(localStorage.getItem(BAL_KEY));
    if(!Array.isArray(saved)||!saved.length) return BAL_DEFAULTS;
    // keep only rows whose program the engine still recognizes
    const ok=saved.filter(b=>PROG_DEFAULT_CPP[b.program]!=null);
    return ok.length?ok:BAL_DEFAULTS;
  }catch{ return BAL_DEFAULTS; }
}

export default function TripOptimizer(){
  const [form,setForm]=useState(loadForm);
  useEffect(()=>{ try{ localStorage.setItem(FORM_KEY, JSON.stringify(form)); }catch{} },[form]);
  const [balances,setBalances]=useState(loadBalances);
  useEffect(()=>{ try{ localStorage.setItem(BAL_KEY, JSON.stringify(balances)); }catch{} },[balances]);
  const [theme,setTheme]=useState(()=>{ try{ return localStorage.getItem("ts_theme")||"auto"; }catch{ return "auto"; } });
  useEffect(()=>{
    const el=document.documentElement;
    theme==="auto"?el.removeAttribute("data-theme"):el.setAttribute("data-theme",theme);
    try{ localStorage.setItem("ts_theme",theme); }catch{}
  },[theme]);
  const [mode,setMode]=useState("cash"); // "cash" = all flights, cash price · "optimize" = points engine
  const [state,setState]=useState({status:"idle", kind:null, data:null, sample:false, err:null});

  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updBal=(i,k,v)=>setBalances(b=>b.map((x,j)=>{
    if(j!==i) return x;
    if(k==="program") return {...x, program:v, value:PROG_DEFAULT_CPP[v] ?? x.value}; // new program -> its default ¢/pt
    return {...x,[k]:v};
  }));
  const addBal=()=>setBalances(b=>{
    const unused=PROGRAMS.map(([p])=>p).find(p=>!b.some(x=>x.program===p));
    return unused?[...b,{program:unused, amount:0, value:PROG_DEFAULT_CPP[unused]}]:b;
  });
  const rmBal=(i)=>setBalances(b=>b.filter((_,j)=>j!==i));

  // Pull the server's actual error message out of a failed response, not just the status code.
  async function errText(res){
    try{ const j=await res.json(); return `engine ${res.status}${j.error?` — ${j.error}`:""}`; }
    catch{ return `engine ${res.status}`; }
  }
  const friendly=(msg)=>/load failed|failed to fetch|network|abort/i.test(msg||"")
    ? "request timed out or dropped — the server may be cold-starting. Try again: finished searches are cached and load instantly"
    : msg;
  // Auto-refresh: while the server reports deferred date pairs, silently re-run the same
  // search — deferred pairs land in the cache within seconds, so each pass fills the grid.
  const runToken=useRef(0);
  const refreshTries=useRef(0);

  const [pairLoading,setPairLoading]=useState(false);

  async function runCash(overrideDates){
    if(state.status==="loading") return; // ignore extra taps
    const dep=overrideDates?.dep||form.depart, ret=overrideDates?.ret||form.return;
    const keepGrid=overrideDates?state.data?.grid:null;      // date-pair tap: keep the sweep grid
    const flex=overrideDates?0:Number(form.flexDays)||0;     // sweep only on a fresh search
    overrideDates?setPairLoading(true)
      :setState({status:"loading", kind:"flights", data:null, sample:false, err:null});
    const origins=String(form.origin).split(",").filter(Boolean);
    const dests=String(form.destination).split(",").filter(Boolean);
    const combos=[];
    for(const o of origins) for(const d of dests) if(combos.length<6) combos.push([o,d]);
    try{
      const settled=await Promise.allSettled(combos.map(([o,d],idx)=>
        fetch(`${API_BASE}/flights`,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ origin:o, destination:d, departureDate:dep, returnDate:ret,
            adults:Number(form.adults), children:Number(form.children), travelClass:form.cabin,
            flexDays: idx===0?flex:0 })})                     // sweep the primary route only
          .then(async res=>{ if(!res.ok) throw new Error(await errText(res)); return res.json(); })
          .then(j=>({...j, _route:`${o}→${d}`}))));
      const oks=settled.filter(s=>s.status==="fulfilled").map(s=>s.value);
      if(!oks.length) throw new Error(settled[0]?.reason?.message||"all routes failed");
      const offers=oks.flatMap(r=>(r.offers||[]).map(o=>({...o,_route:r._route})))
        .sort((a,b)=>a.price-b.price);
      const merged={ ...oks[0], offers, _routes:combos.map(c=>c.join("→")),
        grid: keepGrid||oks[0].grid||null, _gridRoute: combos[0].join("→"),
        _pair:{dep,ret},
        _cacheAgeMs:Math.max(...oks.map(r=>r._cacheAgeMs||0)),
        note:oks.length<combos.length?`${combos.length-oks.length} route(s) failed`:oks[0].note };
      setState({status:"done", kind:"flights", data:merged, sample:false, err:null});
    }catch(e){
      if(!overrideDates) setState({status:"done", kind:"flights", data:null, sample:false, err:friendly(e.message)});
    }finally{ setPairLoading(false); }
  }

  async function run(refreshing=false){
    if(!refreshing && state.status==="loading") return; // ignore extra taps
    if(mode==="cash") return runCash();
    const token=refreshing?runToken.current:++runToken.current;
    if(!refreshing){ refreshTries.current=0; setState({status:"loading", kind:"optimize", data:null, sample:false, err:null}); }
    const cfg={ origin:String(form.origin).split(",")[0], destination:String(form.destination).split(",")[0],
      target:{depart:form.depart, return:form.return}, flexDays:Number(form.flexDays),
      party:{adults:Number(form.adults), children:Number(form.children)}, cabin:form.cabin,
      sources:["aeroplan","flyingblue","american","qatar"],
      balances:Object.fromEntries(balances.map(b=>[b.program,Number(b.amount)])),
      valuations:Object.fromEntries(balances.map(b=>[b.program,Number(b.value)])),
      aviosDistance:1187, awardTax:{Aeroplan:80,"Flying Blue":90,American:50,"BA Avios":60,Qatar:60},
      asOf:new Date().toISOString().slice(0,10) };
    try{
      const res=await fetch(`${API_BASE}/optimize`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(cfg)});
      if(!res.ok) throw new Error(await errText(res));
      const data=await res.json();
      if(token!==runToken.current) return; // a newer search superseded this one
      setState({status:"done", kind:"optimize", data, sample:false, err:null});
      if(data.partial>0 && refreshTries.current<6){
        refreshTries.current++;
        setTimeout(()=>{ if(token===runToken.current) run(true); }, 8000);
      }
    }catch(e){
      if(token!==runToken.current) return;
      if(refreshing) return; // keep the data we already have; background pass just missed
      setState({status:"done", kind:"optimize", data:SAMPLE, sample:true, err:friendly(e.message)});
    }
  }

  return (
    <div style={{background:PAPER,color:INK,fontFamily:sans,minHeight:"100%",padding:"24px 16px 60px"}}>
      <style>{THEME_CSS}</style>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{borderBottom:`2px solid ${INK}`,paddingBottom:12,display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
          <div>
            <div style={{fontFamily:mono,fontSize:11,letterSpacing:"0.18em",color:MUTED,textTransform:"uppercase"}}>
              Cross-program award optimizer
            </div>
            <h1 style={{fontSize:28,fontWeight:800,letterSpacing:"-0.02em",margin:"6px 0 0"}}>
              Cheapest way to fly, points included
            </h1>
          </div>
          <div style={{display:"flex",gap:4}} aria-label="theme">
            {[["auto","Auto"],["light","☀"],["dark","☾"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTheme(k)} title={k}
                style={{fontFamily:mono,fontSize:11,fontWeight:700,padding:"5px 9px",borderRadius:5,cursor:"pointer",
                  border:`1px solid ${theme===k?PRIMARY:HAIR}`,
                  background:theme===k?PRIMARY:SURFACE,color:theme===k?"#fff":MUTED}}>{l}</button>
            ))}
          </div>
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
            <Row><Field label="Flex ±days"><Sel v={form.flexDays} on={v=>upd("flexDays",v)} opts={["0","1","2","3"]}/></Field>
              <Field label="Adults"><In type="number" v={form.adults} on={v=>upd("adults",v)} w={56}/></Field>
              <Field label="Children"><In type="number" v={form.children} on={v=>upd("children",v)} w={56}/></Field></Row>
            {mode==="cash" && (
              <button onClick={()=>run()} disabled={state.status==="loading"}
                style={{marginTop:10,width:"100%",background:PRIMARY,color:"#fff",border:"none",
                borderRadius:6,padding:"11px 0",fontSize:14,fontWeight:700,fontFamily:sans,
                cursor:state.status==="loading"?"wait":"pointer",opacity:state.status==="loading"?0.65:1}}>
                {state.status==="loading"?<><span className="ts-spin"/>Searching…</>:"Show all flights"}
              </button>
            )}
          </Panel>
          {mode==="optimize" && (
          <Panel title="Your balances" sub="program · points · ¢/pt">
            {balances.map((b,i)=>{
              const taken=new Set(balances.map(x=>x.program));
              const opts=PROGRAMS.map(([p])=>p).filter(p=>p===b.program||!taken.has(p));
              return (
                <Row key={i}>
                  <div style={{flex:2,minWidth:130,display:"flex"}}>
                    <div style={{flex:1,display:"grid"}}><Sel v={b.program} on={v=>updBal(i,"program",v)} opts={opts}/></div>
                  </div>
                  <In type="number" v={b.amount} on={v=>updBal(i,"amount",v)} flex={1.4} m right/>
                  <In type="number" step="0.1" v={b.value} on={v=>updBal(i,"value",v)} w={52} m right/>
                  <button onClick={()=>rmBal(i)} aria-label={`remove ${b.program}`}
                    style={{border:`1px solid ${HAIR}`,background:SURFACE,color:MUTED,borderRadius:4,
                      width:30,height:33,cursor:"pointer",fontSize:15,lineHeight:1}}>×</button>
                </Row>
              );
            })}
            {balances.length<PROGRAMS.length&&(
              <button onClick={addBal} style={{fontFamily:mono,fontSize:11,fontWeight:700,letterSpacing:"0.06em",
                color:PRIMARY,background:"none",border:`1px dashed ${HAIR}`,borderRadius:6,
                padding:"7px 12px",cursor:"pointer",marginTop:2}}>+ Add program</button>
            )}
            <button onClick={()=>run()} disabled={state.status==="loading"}
              style={{marginTop:10,width:"100%",background:PRIMARY,color:"#fff",border:"none",
              borderRadius:6,padding:"11px 0",fontSize:14,fontWeight:700,fontFamily:sans,
              cursor:state.status==="loading"?"wait":"pointer",opacity:state.status==="loading"?0.65:1}}>
              {state.status==="loading"?<><span className="ts-spin"/>Searching… fresh sweeps take ~15–30s</>:"Find cheapest"}
            </button>
          </Panel>
          )}
        </div>

        {state.sample && (
          <Banner color={BEST} bg="var(--warn-bg)" bd="var(--warn-bd)">
            Showing SAMPLE output — couldn't reach the engine at {API_BASE} ({state.err}). Run server.js locally or point API_BASE at your deploy.
          </Banner>
        )}
        {state.kind==="flights" && state.err && (
          <Banner color={DANGER} bg="var(--err-bg)" bd="var(--err-bd)">
            Flight search failed ({state.err}). Check DUFFEL_TOKEN on the server.
          </Banner>
        )}

        {state.kind==="flights" && state.data && <FlightList r={state.data} form={form} onPickPair={(dep,ret)=>runCash({dep,ret})} pairLoading={pairLoading}/>}
        {state.kind==="optimize" && state.data && <Results r={state.data} balances={balances} form={form}/>}
        <WatchPanel form={form}/>
        {state.status==="idle" && <Empty/>}
      </div>
    </div>
  );
}

// ---- Cash mode: render every offer the engine returned, cheapest first ----
const hhmm=(iso)=>iso?iso.slice(11,16):"—";
const dur=(d)=>{ if(!d) return "";
  const m=d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); if(!m) return d;
  const h=(+m[1]||0)*24+(+m[2]||0), mm=+m[3]||0;
  return `${h?h+"h ":""}${mm?mm+"m":""}`.trim()||"0m"; };
const AIRLINES={
  // Canada / US
  AC:"Air Canada",RV:"Air Canada Rouge",WS:"WestJet",TS:"Air Transat",PD:"Porter",F8:"Flair",WG:"Sunwing",
  UA:"United",AA:"American",DL:"Delta",B6:"JetBlue",AS:"Alaska",WN:"Southwest",NK:"Spirit",F9:"Frontier",HA:"Hawaiian",
  // Transatlantic / Europe
  AZ:"ITA Airways",AF:"Air France",KL:"KLM",BA:"British Airways",LH:"Lufthansa",LX:"Swiss",OS:"Austrian",
  SN:"Brussels Airlines",IB:"Iberia",EI:"Aer Lingus",TP:"TAP Air Portugal",TK:"Turkish Airlines",
  VS:"Virgin Atlantic",AY:"Finnair",SK:"SAS",LO:"LOT Polish",A3:"Aegean",FI:"Icelandair",UX:"Air Europa",
  // Middle East / Asia / Oceania
  EK:"Emirates",QR:"Qatar Airways",EY:"Etihad",AI:"Air India",JL:"Japan Airlines",NH:"ANA",
  KE:"Korean Air",OZ:"Asiana",CX:"Cathay Pacific",SQ:"Singapore Airlines",QF:"Qantas",NZ:"Air New Zealand",
  // Latin America / Caribbean
  AM:"Aeromexico",CM:"Copa",AV:"Avianca",LA:"LATAM",Y4:"Volaris",BW:"Caribbean Airlines",
  ZZ:"Duffel Airways (test)",ZX:"Duffel Airways (test)"};
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

// ---- Price watches: saved search + target price, emailed when it hits ----
function WatchPanel({form}){
  const [watches,setWatches]=useState(null);   // null = not loaded
  const [email,setEmail]=useState("");
  const [target,setTarget]=useState("");
  const [msg,setMsg]=useState(null);
  const refresh=()=>fetch(`${API_BASE}/watches`).then(r=>r.json()).then(setWatches).catch(()=>setWatches([]));
  useEffect(()=>{ refresh(); },[]);
  async function create(){
    setMsg(null);
    try{
      const res=await fetch(`${API_BASE}/watches`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ origin:String(form.origin).split(",")[0], destination:String(form.destination).split(",")[0],
          depart:form.depart, return:form.return, adults:Number(form.adults), children:Number(form.children),
          cabin:form.cabin, targetPrice:Number(target), email })});
      const j=await res.json();
      if(!res.ok) throw new Error(j.error||"failed");
      setMsg(`Watching ${j.origin}→${j.destination} — alerts to ${j.email} at ≤ $${j.targetPrice}`);
      setTarget(""); refresh();
    }catch(e){ setMsg(`Error: ${e.message}`); }
  }
  async function drop(id){
    await fetch(`${API_BASE}/watches/${id}`,{method:"DELETE"}); refresh();
  }
  return (
    <div style={{marginTop:26,borderTop:`1px solid ${HAIR}`,paddingTop:16}}>
      <h2 style={{fontSize:12,fontFamily:mono,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,margin:"0 0 10px"}}>
        Price watch
      </h2>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"flex-end"}}>
        <Field label="Alert email">
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" inputMode="email"
            style={{fontFamily:mono,fontSize:13,padding:"8px 10px",border:`1px solid ${HAIR}`,borderRadius:6,width:190,background:SURFACE,color:INK}}/>
        </Field>
        <Field label="Target $ (party, all-in)">
          <input value={target} onChange={e=>setTarget(e.target.value)} placeholder="450" inputMode="numeric"
            style={{fontFamily:mono,fontSize:13,padding:"8px 10px",border:`1px solid ${HAIR}`,borderRadius:6,width:90,background:SURFACE,color:INK}}/>
        </Field>
        <button onClick={create} disabled={!email||!target}
          style={{fontFamily:mono,fontSize:12,fontWeight:700,letterSpacing:"0.06em",padding:"9px 14px",
            background:PRIMARY,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",opacity:(!email||!target)?0.5:1}}>
          Watch this search
        </button>
      </div>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:6}}>
        Watches {String(form.origin).split(",")[0]}→{String(form.destination).split(",")[0]} · {form.depart}{form.return?` → ${form.return}`:""} · checks ~every 6h, emails when the cheapest all-in party price hits your target (12h cooldown between alerts).
      </div>
      {msg&&<div style={{fontFamily:mono,fontSize:11,color:msg.startsWith("Error")?BEST:POS,marginTop:6}}>{msg}</div>}
      {watches&&watches.length>0&&(
        <div style={{marginTop:12}}>
          {watches.map(w=>(
            <div key={w.id} style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",alignItems:"baseline",
              fontFamily:mono,fontSize:11.5,padding:"7px 0",borderBottom:`1px solid ${HAIR}`}}>
              <span style={{fontWeight:800}}>{w.origin}→{w.destination}</span>
              <span style={{color:MUTED}}>{w.depart}{w.return?`→${w.return}`:""} · ≤ ${w.targetPrice} · {w.email}</span>
              <span style={{color:MUTED}}>
                {w.lastPrice!=null?`last seen $${Math.round(w.lastPrice)}`:"not checked yet"}
                {w.lastNotifiedAt?` · alerted ${w.lastNotifiedAt.slice(0,10)}`:""}
                {w.lastError?` · ⚠ ${w.lastError}`:""}
              </span>
              <span onClick={()=>drop(w.id)} style={{color:BEST,cursor:"pointer",marginLeft:"auto"}}>remove ×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Filters for the cash flight list. All client-side: the engine already sent every offer. ----
const durMin=(d)=>{ const m=(d||"").match(/PT(?:(\d+)H)?(?:(\d+)M)?/); return m?(+m[1]||0)*60+(+m[2]||0):9e9; };
const totalDur=(o)=>(o.itineraries||[]).reduce((t,s)=>t+durMin(s.duration),0);
const depHour=(o,leg)=>{ const iso=o.itineraries?.[leg]?.segments?.[0]?.depart; return iso?+iso.slice(11,13):null; };
const maxStops=(o)=>Math.max(...(o.itineraries||[{stops:0}]).map(s=>s.stops||0));
const maxLayoverMin=(o)=>{
  let max=0;
  for(const it of o.itineraries||[]){
    const segs=it.segments||[];
    for(let i=1;i<segs.length;i++){
      const gap=(Date.parse(segs[i].depart)-Date.parse(segs[i-1].arrive))/60000;
      if(gap>max) max=gap;
    }
  }
  return max; // 0 for nonstops
};
const LAYOVERS=[["any","Any"],["120","≤ 2h"],["240","≤ 4h"],["360","≤ 6h"]];
const minLayoverMin=(o)=>{
  let min=Infinity;
  for(const it of o.itineraries||[]){
    const segs=it.segments||[];
    for(let i=1;i<segs.length;i++){
      const gap=(Date.parse(segs[i].depart)-Date.parse(segs[i-1].arrive))/60000;
      if(gap<min) min=gap;
    }
  }
  return min;
};
const MIN_LAYOVERS=[["any","Any"],["60","≥ 1h"],["90","≥ 1h30"],["120","≥ 2h"]];
const WINDOWS=[["early","before 8a",h=>h<8],["morning","8a–12p",h=>h>=8&&h<12],["afternoon","12–6p",h=>h>=12&&h<18],["evening","after 6p",h=>h>=18]];
const inWindows=(sel,h)=>!sel.length||h==null||sel.some(k=>WINDOWS.find(w=>w[0]===k)[2](h));
const SORTS=[["price","Cheapest"],["dur","Fastest"],["dep","Earliest out"]];

function Chip({on,active,children,title}){
  return <button onClick={on} title={title} style={{fontFamily:mono,fontSize:11,padding:"5px 10px",borderRadius:14,
    cursor:"pointer",fontWeight:700,whiteSpace:"nowrap",
    border:`1px solid ${active?PRIMARY:HAIR}`,background:active?PRIMARY:SURFACE,color:active?"#fff":INK}}>{children}</button>;
}
const FGroup=({label,children})=>(
  <div style={{marginBottom:8}}>
    <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase",marginBottom:4}}>{label}</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>{children}</div>
  </div>
);

const FLT_DEFAULTS={sort:"price",stops:"any",airlines:[],maxPrice:null,outWin:[],retWin:[],layover:"any",minLayover:"any",hideBasic:false,needChecked:false};

function FilterBar({offers,flt,setFlt,shownCount,hasReturn,cur}){
  // Airline facets with count + lowest price, cheapest-first so the useful chips lead.
  const byAir=useMemo(()=>{
    const m={};
    for(const o of offers){ const c=o.validatingAirlines?.[0]||"—";
      (m[c]??={code:c,n:0,min:Infinity}); m[c].n++; m[c].min=Math.min(m[c].min,o.price); }
    return Object.values(m).sort((a,b)=>a.min-b.min);
  },[offers]);
  const lo=Math.min(...offers.map(o=>o.price)), hi=Math.max(...offers.map(o=>o.price));
  const cap=flt.maxPrice??hi;
  const upd=(patch)=>setFlt(f=>({...f,...patch}));
  const togList=(key,v)=>upd({[key]:flt[key].includes(v)?flt[key].filter(x=>x!==v):[...flt[key],v]});
  const dirty=flt.stops!=="any"||flt.airlines.length||flt.maxPrice!=null||flt.outWin.length||flt.retWin.length||flt.sort!=="price"||flt.layover!=="any"||flt.minLayover!=="any"||flt.hideBasic||flt.needChecked;
  return (
    <div style={{background:SURFACE,border:`1px solid ${HAIR}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <FGroup label="Sort">
        {SORTS.map(([k,l])=><Chip key={k} active={flt.sort===k} on={()=>upd({sort:k})}>{l}</Chip>)}
      </FGroup>
      <FGroup label="Stops">
        {[["any","Any"],["0","Nonstop"],["1","≤ 1 stop"]].map(([k,l])=>
          <Chip key={k} active={flt.stops===k} on={()=>upd({stops:k})}>{l}</Chip>)}
      </FGroup>
      <FGroup label="Layover · shortest / longest">
        {MIN_LAYOVERS.map(([k,l])=><Chip key={"n"+k} active={flt.minLayover===k} on={()=>upd({minLayover:k})}>{l}</Chip>)}
        <span style={{fontFamily:mono,fontSize:11,color:MUTED,padding:"0 2px"}}>·</span>
        {LAYOVERS.map(([k,l])=><Chip key={"x"+k} active={flt.layover===k} on={()=>upd({layover:k})}>{l}</Chip>)}
      </FGroup>
      <FGroup label="Fare">
        <Chip active={flt.hideBasic} on={()=>upd({hideBasic:!flt.hideBasic})}>Hide Basic/Light</Chip>
        <Chip active={flt.needChecked} on={()=>upd({needChecked:!flt.needChecked})}>Checked bag incl.</Chip>
      </FGroup>
      <FGroup label="Airline · from">
        {byAir.map(a=><Chip key={a.code} active={flt.airlines.includes(a.code)} on={()=>togList("airlines",a.code)}
          title={airline(a.code)}>{a.code} {money(a.min,cur)} ({a.n})</Chip>)}
      </FGroup>
      <FGroup label={`Max price · ${money(cap,cur)}${flt.maxPrice==null?" (off)":""}`}>
        <input type="range" min={Math.floor(lo)} max={Math.ceil(hi)} value={cap}
          onChange={e=>upd({maxPrice:+e.target.value>=hi?null:+e.target.value})}
          style={{width:"100%",maxWidth:340,accentColor:PRIMARY}}/>
      </FGroup>
      <FGroup label="Outbound departs">
        {WINDOWS.map(([k,l])=><Chip key={k} active={flt.outWin.includes(k)} on={()=>togList("outWin",k)}>{l}</Chip>)}
      </FGroup>
      {hasReturn && (
        <FGroup label="Return departs">
          {WINDOWS.map(([k,l])=><Chip key={k} active={flt.retWin.includes(k)} on={()=>togList("retWin",k)}>{l}</Chip>)}
        </FGroup>
      )}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:2}}>
        <span style={{fontFamily:mono,fontSize:11,color:MUTED}}>{shownCount} of {offers.length} shown</span>
        {dirty && <button onClick={()=>setFlt(FLT_DEFAULTS)} style={{fontFamily:mono,fontSize:11,color:PRIMARY,
          background:"none",border:"none",cursor:"pointer",fontWeight:700}}>reset filters</button>}
      </div>
    </div>
  );
}

// ---- Flex window for cash: cheapest cash fare per date pair; tap a cell to load its flights ----
function CashMatrix({grid,sel,onSel,route,loading}){
  const deps=[...new Set(grid.map(g=>g.dep))].sort();
  const rets=[...new Set(grid.map(g=>g.ret))].sort();
  const by={}; grid.forEach(g=>by[g.dep+"|"+g.ret]=g);
  const prices=grid.map(g=>g.price); const lo=Math.min(...prices), hi=Math.max(...prices);
  const shade=(p)=>{ const t=hi===lo?0:(p-lo)/(hi-lo); return `hsl(75,${28-18*t}%,${52+28*t}%)`; };
  const md=(d)=>d.slice(5);
  return (
    <div style={{marginBottom:14,opacity:loading?0.55:1,transition:"opacity 0.2s"}}>
      <div style={{fontFamily:mono,fontSize:11,letterSpacing:"0.12em",color:MUTED,textTransform:"uppercase",marginBottom:8}}>
        Flex window · cheapest cash per date pair{route?` · ${route}`:""}{loading?" · loading…":""}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"separate",borderSpacing:4,fontFamily:mono}}>
          <thead><tr><th/>{rets.map(rt=><th key={rt} style={{fontSize:10,color:MUTED,fontWeight:600,padding:"0 2px"}}>{md(rt)}</th>)}</tr></thead>
          <tbody>
            {deps.map(dp=>(
              <tr key={dp}>
                <td style={{fontSize:10,color:MUTED,paddingRight:4}}>{md(dp)}</td>
                {rets.map(rt=>{
                  const g=by[dp+"|"+rt];
                  if(!g) return <td key={rt}/>;
                  const isSel=sel&&sel.dep===dp&&sel.ret===rt;
                  const isLo=g.price===lo;
                  return (
                    <td key={rt}>
                      <button onClick={()=>!loading&&onSel(dp,rt)} disabled={loading}
                        style={{fontFamily:mono,fontSize:12,fontWeight:700,padding:"8px 6px",minWidth:64,
                          borderRadius:7,cursor:loading?"wait":"pointer",background:shade(g.price),color:"#15181E",
                          border:`2px solid ${isSel?PRIMARY:isLo?BEST:"transparent"}`}}>
                        {money(g.price,g.currency)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:4}}>
        amber ring = cheapest · blue ring = shown below · greener = cheaper · tap a pair to load its flights
      </div>
    </div>
  );
}

function FlightList({r,form,onPickPair,pairLoading}){
  const offers=r.offers||[];
  const pax=(Number(form.adults)||0)+(Number(form.children)||0)||1;
  const age=r._cacheAgeMs>60000?`cached ${Math.round(r._cacheAgeMs/60000)} min ago`:"live";
  const [open,setOpen]=useState(null); // index (into shown) of expanded card
  const [flt,setFltRaw]=useState(FLT_DEFAULTS);
  const setFlt=(v)=>{ setOpen(null); setFltRaw(v); }; // indices shift when filters change
  const toggle=(i)=>setOpen(o=>o===i?null:i);

  const shown=useMemo(()=>{
    let s=offers.filter(o=>
      (flt.stops==="any"||maxStops(o)<=+flt.stops) &&
      (!flt.airlines.length||flt.airlines.includes(o.validatingAirlines?.[0])) &&
      (flt.maxPrice==null||o.price<=flt.maxPrice) &&
      inWindows(flt.outWin,depHour(o,0)) &&
      inWindows(flt.retWin,depHour(o,1)) &&
      (flt.layover==="any"||maxLayoverMin(o)<=+flt.layover) &&
      (flt.minLayover==="any"||minLayoverMin(o)>=+flt.minLayover) &&
      (!flt.hideBasic||!o.basic) &&
      (!flt.needChecked||(o.baggage?.checked??0)>0)
    );
    if(flt.sort==="dur") s=[...s].sort((a,b)=>totalDur(a)-totalDur(b));
    else if(flt.sort==="dep") s=[...s].sort((a,b)=>(depHour(a,0)??99)-(depHour(b,0)??99)||a.price-b.price);
    else s=[...s].sort((a,b)=>a.price-b.price);
    return s;
  },[offers,flt]);
  const cheapestShown=shown.length?Math.min(...shown.map(o=>o.price)):null;
  if(!offers.length) return (
    <Banner color={BEST} bg="var(--warn-bg)" bd="var(--warn-bd)">
      No offers returned{r.note?` — ${r.note}`:""}. ULCCs (e.g. Flair) aren't in the feed — check them directly.
    </Banner>
  );
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:8,margin:"4px 0 12px"}}>
        <h2 style={{fontSize:12,fontFamily:mono,letterSpacing:"0.14em",textTransform:"uppercase",color:MUTED,margin:0}}>
          {offers.length} option{offers.length!==1?"s":""} · {form.origin} ⇄ {form.destination}{r._pair?` · ${r._pair.dep} → ${r._pair.ret}`:""} · total for {pax} traveller{pax>1?"s":""}
        </h2>
        <span style={{fontFamily:mono,fontSize:10,color:MUTED}}>{age} · {r.currency}{r.fx&&` · from ${r.fx.from} @ ${r.fx.rate}${r.fx.approx?" (approx — BoC unavailable)":` (BoC ${r.fx.asOf})`}`}</span>
      </div>
      {r.grid&&r.grid.length>1&&(
        <CashMatrix grid={r.grid} sel={r._pair} onSel={onPickPair} route={r._gridRoute} loading={pairLoading}/>
      )}
      {r.gridPartial>0&&(
        <Banner color={BEST} bg="var(--warn-bg)" bd="var(--warn-bd)">
          {r.gridPartial} date pair{r.gridPartial>1?"s":""} still pricing — search again shortly to fill the grid from cache.
        </Banner>
      )}
      <FilterBar offers={offers} flt={flt} setFlt={setFlt} shownCount={shown.length} hasReturn={!!form.return} cur={r.currency}/>
      {!shown.length && (
        <Banner color={BEST} bg="var(--warn-bg)" bd="var(--warn-bd)">
          No flights match these filters — loosen one or hit reset.
        </Banner>
      )}
      {shown.map((o,i)=>(
        <div key={i} role="button" tabIndex={0} aria-expanded={open===i}
          onClick={()=>toggle(i)}
          onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(i); } }}
          style={{background:SURFACE,border:`1px solid ${o.price===cheapestShown?BEST:HAIR}`,cursor:"pointer",
          borderLeft:`4px solid ${o.price===cheapestShown?BEST:HAIR}`,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,alignItems:"flex-start"}}>
            <div style={{flex:"1 1 240px",minWidth:240}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                {o.price===cheapestShown && <span style={{fontFamily:mono,fontSize:9,letterSpacing:"0.1em",color:"#fff",background:BEST,padding:"2px 6px",borderRadius:3}}>CHEAPEST</span>}
                <span style={{fontWeight:800,fontSize:15}}>{airline(o.validatingAirlines?.[0])}</span>
                {r._routes?.length>1&&o._route&&<span style={{fontFamily:mono,fontSize:10,fontWeight:700,color:INK,background:PAPER,border:`1px solid ${HAIR}`,borderRadius:3,padding:"1px 5px"}}>{o._route}</span>}
                {o.cabin && <span style={{fontFamily:mono,fontSize:10,color:MUTED}}>{o.cabin.replace("_"," ")}</span>}
                {o.fareBrand && <span style={{fontFamily:mono,fontSize:10,fontWeight:700,
                  color:o.basic?BEST:MUTED,border:`1px solid ${o.basic?BEST:HAIR}`,
                  borderRadius:3,padding:"1px 5px"}}>{o.fareBrand}</span>}
                {o.baggage && (
                  <span style={{fontFamily:mono,fontSize:10,color:(o.baggage.checked??0)>0?MUTED:BEST}}>
                    {(o.baggage.checked??0)>0
                      ? `${o.baggage.checked} checked bag${o.baggage.checked>1?"s":""}/person`
                      : (o.baggage.carryOn??0)>0 ? "no checked bag" : "no checked bag · carry-on not incl."}
                  </span>
                )}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:16,marginTop:10}}>
                {(o.itineraries||[]).map((s,j)=>(
                  <Slice key={j} s={s} label={j===0?"Outbound":"Return"}/>
                ))}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:"auto"}}>
              <div style={{fontFamily:mono,fontSize:24,fontWeight:800,color:o.price===cheapestShown?POS:INK}}>{money(o.price,r.currency)}</div>
              <div style={{fontFamily:mono,fontSize:11,color:MUTED,whiteSpace:"nowrap"}}>{money(o.price/pax,r.currency)}/person · taxes {money(o.taxes,r.currency)}</div>
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

function Results({r,balances,form}){
  const O=String(form.origin).split(",")[0], D=String(form.destination).split(",")[0];
  const pax={adults:Number(form.adults)||1, children:Number(form.children)||0};
  const b=r.best, aw=b.award, mx=b.mixed;
  const w=b.winner; // "cash" | "award" | "mixed"
  const [sel,setSel]=useState(null); // "dep|ret" of tapped cell
  const selCell=sel?r.grid.find(g=>g.dep+"|"+g.ret===sel):null;
  const headAmt=w==="cash"?cad(b.cash.price):w==="award"?cad(aw.outOfPocket):cad(mx.outOfPocket);
  const headPts=w==="award"?aw.totalPts:w==="mixed"?mx.totalPts:null;
  const headCpp=w==="award"?aw.cppCaptured:w==="mixed"?mx.cppCaptured:null;
  return (
    <div>
      {/* headline */}
      <div style={{background:SURFACE,border:`1px solid ${BEST}`,borderLeft:`4px solid ${BEST}`,borderRadius:10,padding:18,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,alignItems:"baseline"}}>
          <div>
            <span style={{fontFamily:mono,fontSize:10,letterSpacing:"0.12em",color:"#fff",background:BEST,padding:"2px 7px",borderRadius:3}}>CHEAPEST</span>
            <div style={{fontSize:22,fontWeight:800,marginTop:8}}>{b.dep} → {b.ret}</div>
            <div style={{color:MUTED,fontSize:13,marginTop:2}}>
              {w==="cash"?"Pay cash":w==="award"?"Use points":"Split: cash one way, points the other"} · cash if paid {money(b.cash.price,b.cash.currency)}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:mono,fontSize:28,fontWeight:800,color:w==="cash"?INK:POS}}>
              {headAmt}
              {headPts!=null && <span style={{fontSize:13,color:MUTED,fontWeight:600}}> + {fmt(headPts)} pts</span>}
            </div>
            {headCpp!=null && <div style={{fontFamily:mono,fontSize:12,color:POS}}>{headCpp.toFixed(2)} ¢/pt captured</div>}
          </div>
        </div>
        {w==="award" && (
          <div style={{marginTop:14,borderTop:`1px solid ${HAIR}`,paddingTop:12,display:"flex",flexWrap:"wrap",gap:18}}>
            <Leg dir="Outbound" l={aw.outLeg} href={awardHref(aw.outLeg.program,{from:O,to:D,date:b.dep,...pax})}/><Leg dir="Return" l={aw.inLeg} href={awardHref(aw.inLeg.program,{from:D,to:O,date:b.ret,...pax})}/>
            <div style={{fontFamily:mono,fontSize:11,color:MUTED,alignSelf:"flex-end"}}>
              draws: {Object.entries(aw.draws).map(([k,v])=>`${k} ${fmt(v)}`).join(" · ")}
            </div>
          </div>
        )}
        {w==="mixed" && (
          <div style={{marginTop:14,borderTop:`1px solid ${HAIR}`,paddingTop:12,display:"flex",flexWrap:"wrap",gap:18}}>
            <div style={{minWidth:180}}>
              <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>
                {mx.cashLeg==="out"?"Outbound":"Return"} — cash
              </div>
              <div style={{fontWeight:700,fontSize:14,marginTop:3}}>{cad(mx.cashPrice)} one-way</div>
            </div>
            <Leg dir={mx.cashLeg==="out"?"Return — points":"Outbound — points"} l={mx.awardLeg} href={mx.cashLeg==="out"?awardHref(mx.awardLeg.program,{from:D,to:O,date:b.ret,...pax}):awardHref(mx.awardLeg.program,{from:O,to:D,date:b.dep,...pax})}/>
            <div style={{fontFamily:mono,fontSize:11,color:MUTED,alignSelf:"flex-end"}}>
              draws: {Object.entries(mx.draws).map(([k,v])=>`${k} ${fmt(v)}`).join(" · ")}
            </div>
          </div>
        )}
        <ByProgram rows={b.byProgram} balances={balances} cur={b.cash.currency}/>
      </div>

      {r.partial>0&&(
        <Banner color={BEST} bg="var(--warn-bg)" bd="var(--warn-bd)">
          {r.partial} date pair{r.partial>1?"s":""} still pricing in the background — this grid updates itself in a few seconds.
        </Banner>
      )}
      <Matrix grid={r.grid} sel={sel} onSel={(k)=>setSel(s=>s===k?null:k)}/>
      {selCell
        ? <PairDetail g={selCell} balances={balances} O={O} D={D} pax={pax}/>
        : <div style={{fontFamily:mono,fontSize:11,color:MUTED,marginTop:10}}>Tap any date pair for the cash-vs-points breakdown.</div>}

      <p style={{color:MUTED,fontSize:12,marginTop:16,lineHeight:1.6}}>
        <strong style={{color:INK}}>Read the flags.</strong> <span style={{color:BEST}}>[est]</span> marks the distance-based Avios price Seats.aero can't see — {r.aviosNote}. Verify award space before transferring; transfers are irreversible. Cash sweep used {r.cashCalls} searches.
      </p>
    </div>
  );
}

// ---- Tapped-cell breakdown: cash vs points for one date pair, always both sides ----
function PairDetail({g,balances,O,D,pax}){
  const ref=g.award||g.awardRef;                 // feasible solve, else unconstrained reference
  const feasible=!!g.award;
  const bal=Object.fromEntries((balances||[]).map(b=>[b.program,Number(b.amount)||0]));
  const shorts=ref&&!feasible
    ? Object.entries(ref.draws).map(([src,need])=>({src,need,have:bal[src]??0,short:Math.max(0,need-(bal[src]??0))})).filter(s=>s.short>0)
    : [];
  // winner: "cash" | "award" | "mixed"
  const col={flex:"1 1 220px",minWidth:220,background:SURFACE,border:`1px solid ${HAIR}`,borderRadius:8,padding:"12px 14px"};
  return (
    <div style={{marginTop:12}}>
      <div style={{fontFamily:mono,fontSize:11,letterSpacing:"0.1em",color:MUTED,textTransform:"uppercase",marginBottom:8}}>
        {g.dep} → {g.ret}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        <div style={{...col,borderColor:g.winner==="cash"?POS:HAIR,borderLeft:`4px solid ${g.winner==="cash"?POS:HAIR}`}}>
          <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>Cash{g.winner==="cash"?" · winner":""}</div>
          <div style={{fontFamily:mono,fontSize:22,fontWeight:800,marginTop:4}}>{money(g.cash.price,g.cash.currency)}</div>
          <div style={{fontFamily:mono,fontSize:11,color:MUTED}}>whole party, all-in{g.cash.taxes?` · taxes ${money(g.cash.taxes,g.cash.currency)}`:""}</div>
          {g.cash.fx&&<div style={{fontFamily:mono,fontSize:10,color:MUTED}}>converted from {g.cash.fx.from} {fmt(g.cash.fx.originalPrice)} @ {g.cash.fx.rate}{g.cash.fx.approx?" (approx)":""}</div>}
          <a href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${O} to ${D} on ${g.dep} through ${g.ret}`)}`}
            target="_blank" rel="noopener noreferrer" style={VERIFY_STYLE}>Google Flights ↗</a>
        </div>
        {g.mixed&&(
          <div style={{...col,borderColor:g.winner==="mixed"?POS:HAIR,borderLeft:`4px solid ${g.winner==="mixed"?POS:HAIR}`}}>
            <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>Split{g.winner==="mixed"?" · winner":""}</div>
            <div style={{fontFamily:mono,fontSize:22,fontWeight:800,marginTop:4}}>
              {cad(g.mixed.outOfPocket)} <span style={{fontSize:13,fontWeight:600,color:MUTED}}>+ {fmt(g.mixed.totalPts)} pts</span>
            </div>
            <div style={{fontFamily:mono,fontSize:11,color:MUTED,marginTop:4,lineHeight:1.7}}>
              {g.mixed.cashLeg==="out"?"out":"ret"}: cash {cad(g.mixed.cashPrice)} one-way<br/>
              {g.mixed.cashLeg==="out"?"ret":"out"}: {g.mixed.awardLeg.program}{g.mixed.awardLeg.estimated?" [est]":""} {fmt(g.mixed.awardLeg.sourcePts)} via {g.mixed.awardLeg.source}<br/>
              value captured: {g.mixed.cppCaptured.toFixed(2)} ¢/pt
            </div>
            {(()=>{ const isRetAward=g.mixed.cashLeg==="out";
              const h=awardHref(g.mixed.awardLeg.program,{from:isRetAward?D:O,to:isRetAward?O:D,date:isRetAward?g.ret:g.dep,...pax});
              return h&&<a href={h} target="_blank" rel="noopener noreferrer" style={VERIFY_STYLE}>verify on {g.mixed.awardLeg.program} ↗</a>; })()}
          </div>
        )}
        <div style={{...col,borderColor:g.winner==="award"?POS:HAIR,borderLeft:`4px solid ${g.winner==="award"?POS:HAIR}`}}>
          <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>
            Points{g.winner==="award"?" · winner":""}{!feasible&&ref?" · not enough points":""}
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
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {awardHref(ref.outLeg.program,{from:O,to:D,date:g.dep,...pax})&&
                  <a href={awardHref(ref.outLeg.program,{from:O,to:D,date:g.dep,...pax})} target="_blank" rel="noopener noreferrer" style={VERIFY_STYLE}>verify out · {ref.outLeg.program} ↗</a>}
                {awardHref(ref.inLeg.program,{from:D,to:O,date:g.ret,...pax})&&
                  <a href={awardHref(ref.inLeg.program,{from:D,to:O,date:g.ret,...pax})} target="_blank" rel="noopener noreferrer" style={VERIFY_STYLE}>verify ret · {ref.inLeg.program} ↗</a>}
              </div>
            </>
          ):(
            <div style={{fontFamily:mono,fontSize:12,color:MUTED,marginTop:6}}>No award space found for this pair.</div>
          )}
        </div>
      </div>
      <ByProgram rows={g.byProgram} balances={balances} cur={g.cash.currency}/>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:8}}>
        Points are for all travellers. Programs don't let you split one ticket between points and cash here — it's one or the other per ticket (taxes are always cash).
      </div>
    </div>
  );
}

function Leg({dir,l,href}){
  return (
    <div style={{minWidth:180}}>
      <div style={{fontFamily:mono,fontSize:9,letterSpacing:"0.08em",color:MUTED,textTransform:"uppercase"}}>{dir}</div>
      <div style={{fontWeight:700,fontSize:14,marginTop:3}}>
        {l.program} {l.estimated && <span style={{color:BEST,fontSize:11}}>[est]</span>}
      </div>
      <div style={{fontFamily:mono,fontSize:12,color:MUTED,marginTop:2}}>
        {fmt(l.points)} via {l.source} ({l.via}) → {fmt(l.sourcePts)} pts
      </div>
      {href && <a href={href} target="_blank" rel="noopener noreferrer" style={VERIFY_STYLE}>verify on {l.program} ↗</a>}
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
                        <span style={{position:"absolute",top:2,right:3,fontSize:8,opacity:0.85}}>{g.winner==="award"?"◆":g.winner==="mixed"?"◐":"$"}</span>
                      </div>
                    </td>
                  );})}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{fontFamily:mono,fontSize:10,color:MUTED,marginTop:6}}>◆ points · ◐ split · $ cash · amber ring = cheapest · blue ring = selected · greener = cheaper · tap a cell for details</div>
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
