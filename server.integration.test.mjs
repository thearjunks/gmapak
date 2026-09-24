import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const request=async(origin,pathname,{method='GET',cookie,body}={})=>fetch(origin+pathname,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json','X-Dashboard-Request':'1'}:{})},body:body?JSON.stringify(body):undefined});

test('server enforces per-screen and administrative permissions',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ak-server-'));
  const port=4400+Math.floor(Math.random()*400);
  const origin=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:origin,AK_DATA_DIR:directory,APP_USERNAME:'arjun.sajimon',APP_PASSWORD:'TestBootstrap!9',APP_PASSWORD_SHA256:'',SESSION_SECRET:'integration-test-secret',DISABLE_AUTO_REFRESH:'1'},stdio:'ignore'});
  t.after(()=>{child.kill();fs.rmSync(directory,{recursive:true,force:true});});
  for(let attempt=0;attempt<50;attempt++){try{const response=await fetch(origin+'/health');if(response.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,40));}
  const login=await request(origin,'/api/auth/login',{method:'POST',body:{username:'arjun.sajimon',password:'TestBootstrap!9'}});
  assert.equal(login.status,200);
  const adminCookie=login.headers.get('set-cookie').split(';')[0];
  const session=await (await request(origin,'/api/auth/session',{cookie:adminCookie})).json();
  assert.deepEqual(session.roles,['super_admin','admin']);
  const created=await request(origin,'/api/admin/users',{method:'POST',cookie:adminCookie,body:{username:'review.viewer',displayName:'Review Viewer',password:'Temporary!1',roles:['user'],permissions:['screen:reviews']}});
  assert.equal(created.status,201);
  const viewerLogin=await request(origin,'/api/auth/login',{method:'POST',body:{username:'review.viewer',password:'Temporary!1'}});
  const viewerCookie=viewerLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(origin,'/api/snapshot?screen=reviews',{cookie:viewerCookie})).status,200);
  assert.equal((await request(origin,'/api/snapshot?screen=branches',{cookie:viewerCookie})).status,403);
  assert.equal((await request(origin,'/api/admin/users',{cookie:viewerCookie})).status,403);
  assert.equal((await request(origin,'/api/google/refresh',{method:'POST',cookie:viewerCookie,body:{}})).status,403);
  const overviewOnly=await request(origin,'/api/admin/users',{method:'POST',cookie:adminCookie,body:{username:'overview.viewer',displayName:'Overview Viewer',password:'Temporary!2',roles:['user'],permissions:['screen:overview']}});
  assert.equal(overviewOnly.status,201);
  const overviewLogin=await request(origin,'/api/auth/login',{method:'POST',body:{username:'overview.viewer',password:'Temporary!2'}});
  const overviewCookie=overviewLogin.headers.get('set-cookie').split(';')[0];
  const overviewSnapshot=await (await request(origin,'/api/snapshot?screen=overview',{cookie:overviewCookie})).json();
  assert.equal(overviewSnapshot.queries.reviews.rows.length,0);
  assert.equal(typeof overviewSnapshot.accessSummary.reviewBodies,'number');
});
