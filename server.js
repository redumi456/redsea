const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ════════════════════════════════════════════
//   🔴 RED SEA BACKEND v2.0
//   Call order: EGYPT first → ERITREA second
//   UAE mic: AUTO-MUTED after merge
// ════════════════════════════════════════════

const DB_FILE    = path.join(__dirname, 'db_users.json');
const CALLS_FILE = path.join(__dirname, 'db_calls.json');
const UAE_FILE   = path.join(__dirname, 'db_uae.json');

function loadJSON(file, def) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch(e) {}
  fs.writeFileSync(file, JSON.stringify(def, null, 2));
  return def;
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch(e) {}
}
function now() {
  return new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})
    + ' ' + new Date().toLocaleDateString('en-US',{weekday:'short',day:'2-digit',month:'short'});
}
function makeId(p){ return p + Date.now(); }

// ── DATABASE ──
let users = loadJSON(DB_FILE, [
  {id:'u1',username:'Ridwan',password:'RedSea2024',role:'master',enabled:true,
   minutes:{today:0,yesterday:0,thisMonth:0,lastMonth:0},calls:0},
]);

let callsDB = loadJSON(CALLS_FILE, { history:[], waiting:[] });

let uaeConfig = loadJSON(UAE_FILE, {
  number:'+97150xxxxxxx', simSlot:1,
  deviceName:'UAE Controller Phone',
  online:false, autoMuteOnMerge:true,
  lastPing: new Date().toISOString(),
});

let liveCalls = [];

// ════ AUTH ════
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({error:'Missing credentials'});
  const user = users.find(u=>u.username.toLowerCase()===username.toLowerCase()&&u.password===password);
  if(!user)        return res.status(401).json({error:'Wrong username or password'});
  if(!user.enabled) return res.status(403).json({error:'Account disabled — contact master'});
  console.log('✅ Login:', user.username, '|', user.role);
  res.json({success:true, user:{id:user.id,username:user.username,role:user.role,minutes:user.minutes}});
});

// ════ USERS ════
app.get('/api/users', (req,res) => {
  res.json(users.map(({password,...u})=>u));
});

app.post('/api/users', (req,res) => {
  const {username,password,role} = req.body;
  if(!username||!password) return res.status(400).json({error:'Username and password required'});
  if(password.length<6)    return res.status(400).json({error:'Password min 6 chars'});
  if(users.find(u=>u.username.toLowerCase()===username.toLowerCase()))
    return res.status(409).json({error:'Username already exists'});
  const u = {id:makeId('u'),username,password,role:role||'user',enabled:true,
             minutes:{today:0,yesterday:0,thisMonth:0,lastMonth:0},calls:0};
  users.push(u);
  saveJSON(DB_FILE,users);
  console.log('👤 Created:', username, '|', role);
  const {password:_,...safe}=u;
  res.json({success:true,user:safe});
});

app.patch('/api/users/:id', (req,res) => {
  const u = users.find(x=>x.id===req.params.id);
  if(!u) return res.status(404).json({error:'Not found'});
  if(req.body.enabled!==undefined) u.enabled=req.body.enabled;
  if(req.body.role)    u.role=req.body.role;
  if(req.body.password&&req.body.password.length>=6) u.password=req.body.password;
  saveJSON(DB_FILE,users);
  res.json({success:true});
});

app.delete('/api/users/:id', (req,res) => {
  const idx = users.findIndex(u=>u.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  users.splice(idx,1);
  saveJSON(DB_FILE,users);
  res.json({success:true});
});

// ════ CALL HISTORY ════
app.get('/api/calls/history', (req,res) => {
  const {user,search} = req.query;
  let result = [...callsDB.history].reverse();
  if(user){
    const u = users.find(x=>x.username.toLowerCase()===user.toLowerCase());
    if(!u||(u.role!=='admin'&&u.role!=='master'))
      result = result.filter(c=>c.user.toLowerCase()===user.toLowerCase());
  }
  if(search){
    const q=search.toLowerCase();
    result=result.filter(c=>c.from.includes(q)||c.to.includes(q)||
      (c.memo||'').toLowerCase().includes(q)||c.user.toLowerCase().includes(q));
  }
  res.json(result);
});

// ════ WAITING CALLS ════
app.get('/api/calls/waiting', (req,res) => {
  const {user} = req.query;
  let result = [...callsDB.waiting];
  if(user){
    const u=users.find(x=>x.username.toLowerCase()===user.toLowerCase());
    if(!u||(u.role!=='admin'&&u.role!=='master'))
      result=result.filter(c=>c.user.toLowerCase()===user.toLowerCase());
  }
  res.json(result);
});

// ════ SUBMIT CALL ════
// EGYPT called FIRST → ERITREA called SECOND → UAE AUTO-MUTES
app.post('/api/calls/submit', (req,res) => {
  const {from,to,memo,limit,user} = req.body;
  if(!from||!to||!limit) return res.status(400).json({error:'from, to, limit required'});
  const u=users.find(x=>x.username.toLowerCase()===(user||'').toLowerCase());
  if(!u||!u.enabled) return res.status(403).json({error:'Account not authorized'});
  const call = {
    id:makeId('w'), from, to, memo:memo||'',
    limit:parseInt(limit), time:now(),
    user:user||'unknown', status:'pending',
    callOrder:{step1:'UAE dials '+from+' (Egypt) FIRST',
               step2:'UAE dials '+to+' (Eritrea) SECOND',
               step3:'Merge → UAE mic AUTO-MUTED 🔇'}
  };
  callsDB.waiting.push(call);
  saveJSON(CALLS_FILE,callsDB);
  console.log('📞 Call queued:', from,'→',to,'| Limit:',limit,'min | By:',user);
  res.json({success:true,call});
});

// ════ CANCEL WAITING ════
app.delete('/api/calls/waiting/:id', (req,res) => {
  const {user,role} = req.body;
  const idx = callsDB.waiting.findIndex(c=>c.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'Not found'});
  const call = callsDB.waiting[idx];
  if(role!=='admin'&&role!=='master'&&call.user!==user)
    return res.status(403).json({error:'Not allowed'});
  callsDB.waiting.splice(idx,1);
  saveJSON(CALLS_FILE,callsDB);
  res.json({success:true});
});

// UAE PHONE picks up next waiting call
app.get('/api/calls/next', (req,res) => {
  const pending = callsDB.waiting.find(c=>c.status==='pending');
  if(!pending) return res.json({call:null});
  // Mark as processing
  pending.status = 'processing';
  saveJSON(CALLS_FILE,callsDB);
  res.json({call:pending});
});

// UAE PHONE reports call started
app.post('/api/calls/started', (req,res) => {
  const {id,uaeNumber} = req.body;
  const call = callsDB.waiting.find(c=>c.id===id);
  if(call){
    call.status='active';
    call.startTime=new Date().toISOString();
    call.uaeNumber=uaeNumber;
    saveJSON(CALLS_FILE,callsDB);
    // Move to live
    liveCalls.push({...call,live:true,uaeMuted:false,dur:'0 min'});
  }
  res.json({success:true});
});

// UAE PHONE reports call completed
app.post('/api/calls/completed', (req,res) => {
  const {id,duration,status} = req.body;
  const idx = callsDB.waiting.findIndex(c=>c.id===id);
  if(idx>-1){
    const call = callsDB.waiting[idx];
    callsDB.history.push({
      id:makeId('h'), from:call.from, to:call.to,
      memo:call.memo, limit:call.limit,
      duration:duration||'Unknown', status:status||'success',
      time:now(), user:call.user
    });
    callsDB.waiting.splice(idx,1);
    saveJSON(CALLS_FILE,callsDB);
  }
  liveCalls = liveCalls.filter(c=>c.id!==id);
  res.json({success:true});
});

// ════ LIVE CALLS ════
app.get('/api/calls/live', (req,res) => res.json(liveCalls));

app.post('/api/calls/live/:id/end', (req,res) => {
  const c=liveCalls.find(x=>x.id===req.params.id);
  if(c){c.live=false;c.uaeMuted=false;}
  res.json({success:true});
});

// ════ UAE PHONE ════
app.get('/api/uae', (req,res) => {
  uaeConfig.lastPing=new Date().toISOString();
  res.json(uaeConfig);
});

app.post('/api/uae', (req,res) => {
  const {number,simSlot,deviceName} = req.body;
  if(number)     uaeConfig.number='+971'+number.replace(/\D/g,'');
  if(simSlot)    uaeConfig.simSlot=simSlot;
  if(deviceName) uaeConfig.deviceName=deviceName;
  uaeConfig.autoMuteOnMerge=true;
  saveJSON(UAE_FILE,uaeConfig);
  res.json({success:true,uae:uaeConfig});
});

app.post('/api/uae/ping', (req,res) => {
  uaeConfig.online=true;
  uaeConfig.lastPing=new Date().toISOString();
  saveJSON(UAE_FILE,uaeConfig);
  res.json({success:true,waitingCount:callsDB.waiting.filter(c=>c.status==='pending').length});
});

app.post('/api/uae/mute', (req,res) => {
  const {callId,muted}=req.body;
  const c=liveCalls.find(x=>x.id===callId);
  if(c) c.uaeMuted=muted;
  console.log('🔇 UAE',muted?'MUTED':'UNMUTED','call:',callId);
  res.json({success:true});
});

// ════ STATS ════
app.get('/api/stats', (req,res) => {
  res.json({
    totalToday:   users.reduce((s,u)=>s+u.minutes.today,0),
    totalMonth:   users.reduce((s,u)=>s+u.minutes.thisMonth,0),
    activeUsers:  users.filter(u=>u.enabled).length,
    waitingCount: callsDB.waiting.length,
    liveCount:    liveCalls.filter(c=>c.live).length,
    topUsers:     [...users].sort((a,b)=>b.minutes.thisMonth-a.minutes.thisMonth)
                  .slice(0,10).map(({password,...u})=>u),
  });
});

// Health check
app.get('/', (req,res) => res.json({
  status:'🔴 RED SEA Backend Running',
  version:'2.0',
  time:now(),
  waitingCalls:callsDB.waiting.length,
  uaeOnline:uaeConfig.online,
}));

app.listen(PORT, () => {
  console.log('════════════════════════════════════════');
  console.log('🔴 RED SEA BACKEND v2.0 — PORT:', PORT);
  console.log('════════════════════════════════════════');
  console.log('📞 Call order: EGYPT FIRST → ERITREA SECOND');
  console.log('🔇 UAE auto-mute on merge: ENABLED');
  console.log('💾 Data saved to JSON files');
  console.log('════════════════════════════════════════');
});
