import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createAuth} from './auth.mjs';
import {GoogleClient,refreshSnapshot,SCOPE,GROUP} from './google-client.mjs';
import {GoogleMapsPublicClient,refreshPublicSnapshot} from './google-maps-public.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.join(root,'dashboard'),dist=path.join(root,'public'),privateDir=path.join(root,'.private');
const envPath=path.join(root,'.env.local');
if(fs.existsSync(envPath))for(const line of fs.readFileSync(envPath,'utf8').split(/\r?\n/)){
 const match=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^(["'])(.*)\1$/,'$2');
}
const port=Number(process.env.PORT||4387),listenHost=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1'),origin=(process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`).replace(/\/$/,''),redirectUri=`${origin}/oauth/callback`,snapshotPath=path.join(project,'src/data.json');
const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,new URL(origin).host]);
const auth=createAuth({username:process.env.APP_USERNAME,password:process.env.APP_PASSWORD,passwordHash:process.env.APP_PASSWORD_SHA256,secret:process.env.SESSION_SECRET});
fs.mkdirSync(privateDir,{recursive:true});
if(process.platform==='win32'){const user=execFileSync('whoami',[],{encoding:'utf8'}).trim();execFileSync('icacls',[privateDir,'/inheritance:r','/grant:r',`${user}:(OI)(CI)F`],{stdio:'ignore'});}else fs.chmodSync(privateDir,0o700);
const read=(p,fallback)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return fallback;}};
const atomic=(p,v)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2),{mode:0o600});fs.renameSync(p+'.tmp',p);};
const config=()=>{const stored=read(path.join(privateDir,'google-client.json'),{}),c=stored.web??stored;return {client_id:process.env.GOOGLE_CLIENT_ID||c.client_id,client_secret:process.env.GOOGLE_CLIENT_SECRET||c.client_secret};};
const tokenPath=path.join(privateDir,'google-tokens.json');
const tokens=()=>{const stored=read(tokenPath,{});return {refresh_token:process.env.GOOGLE_REFRESH_TOKEN||stored.refresh_token};};
let state=read(path.join(privateDir,'sync-status.json'),{lastAttempt:null,lastSuccess:null,message:'Google OAuth client setup is required.'});state.syncing=false;
if(/Business Profile API|OAuth client setup/i.test(state.message??''))state.message='Ready to refresh ratings and review counts from public Google Maps listings.';
let states=new Map();
const configured=()=>Boolean(config().client_id&&config().client_secret);
const connected=()=>configured()&&Boolean(tokens().refresh_token);
const saveState=()=>atomic(path.join(privateDir,'sync-status.json'),state);
const publicStatus=()=>{const snapshot=read(snapshotPath,{});return {...state,configured:configured(),connected:connected(),source:snapshot.sync?.source||'Google Maps public listings',groupId:GROUP,redirectUri,refreshMinutes:15,snapshotVersion:snapshot.generatedAt,message:state.message};};
async function tokenRequest(params){const c=config();const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,...params}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Google authorization failed. Check OAuth configuration or reconnect the Google account.');const token=await r.json();if(!token.access_token)throw Error('Google did not return an access token.');return token;}
async function sync(){if(state.syncing)return;state.syncing=true;state.lastAttempt=new Date().toISOString();state.message='Reading the latest Google Business Profile data…';saveState();let old;
 try{old=read(snapshotPath,null);let next,officialError=null;
  if(connected())try{const token=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens().refresh_token});next=await refreshSnapshot(old,new GoogleClient(token.access_token));}catch(error){officialError=error.message||'Official Business Profile API refresh failed.';}
  if(!next){next=await refreshPublicSnapshot(old,new GoogleMapsPublicClient());if(officialError)next.sync.officialApiError=officialError;}
  atomic(snapshotPath,next);state.lastSuccess=next.generatedAt;state.message=next.sync.source?.startsWith('Google Business')?`Updated ${next.sync.succeeded} branches from the official Business Profile APIs; ${next.sync.failed} retained previous data.`:`Updated ${next.sync.succeeded} branches from public Google Maps; ${next.sync.failed} failed or were ambiguous and retain previous data.${next.sync.officialApiError?' Official API unavailable: '+next.sync.officialApiError:''}`;
 }catch(e){state.message=e.message||'Google refresh failed. Existing snapshot retained.';}finally{state.syncing=false;saveState();}}
const securityHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function json(res,code,body,headers={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...securityHeaders,...headers});res.end(JSON.stringify(body));}
function redirect(res,location){res.writeHead(303,{Location:location,'Cache-Control':'no-store, private','Vary':'Cookie',...securityHeaders});res.end();}
const cookies=req=>Object.fromEntries((req.headers.cookie??'').split(';').map(item=>{const index=item.indexOf('=');if(index<0)return null;try{return [decodeURIComponent(item.slice(0,index).trim()),decodeURIComponent(item.slice(index+1).trim())];}catch{return null;}}).filter(Boolean));
const session=req=>auth.validate(cookies(req).ak_session);
const body=async req=>{let value='';for await(const chunk of req){value+=chunk;if(value.length>8192)throw Error('Request body is too large.');}return JSON.parse(value||'{}');};
const sessionCookie=token=>`ak_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${origin.startsWith('https:')?'; Secure':''}`;
function serve(res,req,fileName){
 const file=path.resolve(dist,fileName);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{message:'Not found.'});
 const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.json':'application/json; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
 res.writeHead(200,{'Content-Type':types[ext]??'application/octet-stream','Cache-Control':'no-store',...securityHeaders});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}
const server=http.createServer(async(req,res)=>{try{
 if(!allowedHosts.has(req.headers.host))return json(res,403,{message:'Invalid host.'});
 const url=new URL(req.url,origin);
 if(req.method==='POST'&&(req.headers['x-dashboard-request']!=='1'||(req.headers.origin&&![origin,`http://localhost:${port}`].includes(req.headers.origin))))return json(res,403,{message:'Same-origin dashboard request required.'});
 if(req.method==='GET'&&url.pathname==='/health'){const snapshot=read(snapshotPath,{});return json(res,200,{status:'ok',app:'ak-branch-monitor',authConfigured:auth.configured,branches:snapshot.queries?.branches?.rows?.length??0,refreshSource:snapshot.sync?.source||'Google Maps public listings'});}
 if(req.method==='POST'&&url.pathname==='/api/auth/login'){
  if(!auth.configured)return json(res,503,{message:'Application login is not configured.'});
  const credentials=await body(req);if(!auth.credentialsMatch(credentials.username,credentials.password))return json(res,401,{message:'Incorrect username or password.'});
  return json(res,200,{authenticated:true,username:credentials.username},{'Set-Cookie':sessionCookie(auth.issue())});
 }
 const signedIn=session(req);
 if(['/sign-in','/login','/login.html','/login.css','/login.js'].includes(url.pathname)){
  if(signedIn&&(url.pathname==='/sign-in'||url.pathname==='/login'||url.pathname==='/login.html'))return redirect(res,'/');
  const asset=['/sign-in','/login','/login.html'].includes(url.pathname)?'login.html':url.pathname.slice(1);return serve(res,req,asset);
 }
 if(!signedIn){if(url.pathname.startsWith('/api/')||url.pathname==='/oauth/callback')return json(res,401,{message:'Authentication required.'});return redirect(res,'/sign-in');}
 if(req.method==='GET'&&url.pathname==='/api/auth/session')return json(res,200,{authenticated:true,username:signedIn.u});
 if(req.method==='POST'&&url.pathname==='/api/auth/logout')return json(res,200,{authenticated:false},{'Set-Cookie':`ak_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${origin.startsWith('https:')?'; Secure':''}`});
 if(req.method==='GET'&&url.pathname==='/api/snapshot')return json(res,200,read(snapshotPath,{}));
 if(req.method==='GET'&&url.pathname==='/api/google/status')return json(res,200,publicStatus());
 if(req.method==='POST'&&url.pathname==='/api/google/refresh'){if(state.syncing)return json(res,202,{message:'A refresh is already running.'});sync().catch(()=>{});return json(res,202,{message:'Google refresh started. Official Business Profile data is preferred when API access is available.'});}
 if(req.method==='POST'&&url.pathname==='/api/google/connect'){
  if(!configured())return json(res,409,{message:publicStatus().message});const stateId=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');for(const [k,v]of states)if(v.expires<Date.now())states.delete(k);states.set(stateId,{verifier,expires:Date.now()+600000});
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:config().client_id,redirect_uri:redirectUri,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state:stateId,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});res.setHeader('Set-Cookie',`oauth_state=${stateId}; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=600`);return json(res,200,{url:u.toString()});
 }
 if(req.method==='GET'&&url.pathname==='/oauth/callback'){
  const stateId=url.searchParams.get('state'),pending=states.get(stateId),cookie=(req.headers.cookie??'').match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];states.delete(stateId);
  if(!pending||pending.expires<Date.now()||cookie!==stateId)return json(res,400,{message:'Authorization expired or did not originate here. Start again from the dashboard.'});if(url.searchParams.has('error'))return json(res,400,{message:'Google authorization was not granted. No credentials saved.'});
  const tokens=await tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code')??'',redirect_uri:redirectUri,code_verifier:pending.verifier});if(!tokens.refresh_token)throw Error('Google did not grant offline access. Reconnect and grant consent.');atomic(tokenPath,{refresh_token:tokens.refresh_token});state.message='Authorized. Initial sync started.';saveState();res.writeHead(303,{Location:origin,'Set-Cookie':'oauth_state=; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=0','Referrer-Policy':'no-referrer'});res.end();sync().catch(()=>{});return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{message:'Method not allowed.'});
 const pathname=decodeURIComponent(url.pathname),relative=pathname==='/'?'index.html':pathname.replace(/^\//,'');return serve(res,req,relative);
 }catch(e){json(res,500,{message:e.message||'Request failed.'});}});
server.listen(port,listenHost,()=>{console.log(`AK Branch Monitor: ${origin}`);});
setTimeout(()=>{if(!state.syncing)sync().catch(()=>{});},5000).unref();
setInterval(()=>{if(!state.syncing)sync().catch(()=>{});},15*60*1000).unref();
