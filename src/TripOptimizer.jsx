import React, { useState, useMemo } from "react";

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

export default function TripOptimizer(){
  const [form,setForm]=useState({ origin:"YYZ", destination:"MCO", depart:"2026-08-04", return:"2026-08-14",
    flexDays:2, cabin:"economy", adults:2, children:2 });
  const [balances,setBalances]=useState([
    {program:"Amex MR (CA)", amount:95000, value:1.7},
    {program:"Aeroplan", amount:42000, value:1.5},
    {program:"RBC Avion", amount:80000, value:1.5},
    {program:"BA Avios", amount:30000, value:1.7},
  ]);
  const [state,setState]=useState({status:"idle", data:null, sample:false, err:null});

  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const updBal=(i,k,v)=>setBalances(b=>b.map((x,j)=>j===i?{...x,[k]:v}:x));

  async function run(){
    setState({status:"loading", data:null, sample:false, err:null});
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
      if(!res.ok) throw new Error("engine "+res.status);
      setState({status:"done", data:await res.json(), sample:false, err:null});
    }catch(e){
      setState({status:"done", data:SAMPLE, sample:true, err:e.message});
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

        {/* form */}
        <div style={{display:"flex",flexWrap:"wrap",gap:16,margin:"20px 0"}}>
          <Panel title="Trip">
            <Row><Field label="From"><In v={form.origin} on={v=>upd("origin",v.toUpperCase())} w={64}/></Field>
              <Field label="To"><In v={form.destination} on={v=>upd("destination",v.toUpperCase())} w={64}/></Field>
              <Field label="Cabin"><Sel v={form.cabin} on={v=>upd("cabin",v)} opts={["economy","business"]}/></Field></Row>
            <Row><Field label="Depart"><In type="date" v={form.depart} on={v=>upd("depart",v)} w={140}/></Field>
              <Field label="Return"><In type="date" v={form.return} on={v=>upd("return",v)} w={140}/></Field></Row>
            <Row><Field label="Flex ±days"><Sel v={form.flexDays} on={v=>upd("flexDays",v)} opts={["0","1","2","3"]}/></Field>
              <Field label="Adults"><In type="number" v={form.adults} on={v=>upd("adults",v)} w={56}/></Field>
              <Field label="Children"><In type="number" v={form.children} on={v=>upd("children",v)} w={56}/></Field></Row>
          </Panel>
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
        </div>

        {state.sample && (
          <Banner color={BEST} bg="#FBF3E7" bd="#EAD9BD">
            Showing SAMPLE output — couldn't reach the engine at {API_BASE} ({state.err}). Run server.js locally or point API_BASE at your deploy.
          </Banner>
        )}

        {state.data && <Results r={state.data}/>}
        {state.status==="idle" && <Empty/>}
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
