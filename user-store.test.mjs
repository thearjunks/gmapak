import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createUserStore,ALL_PERMISSIONS} from './user-store.mjs';

const fixture=()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ak-users-'));
  const file=path.join(directory,'users.json');
  const store=createUserStore({file,bootstrapUsername:'arjun.sajimon',bootstrapPassword:'TestBootstrap!9'});
  return {directory,file,store,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
};

test('bootstrap account is both Admin and Super Admin with full access',t=>{
  const f=fixture();t.after(f.cleanup);
  const arjun=f.store.authenticate('arjun.sajimon','TestBootstrap!9');
  assert.deepEqual(arjun.roles,['super_admin','admin']);
  assert.deepEqual(arjun.permissions,ALL_PERMISSIONS);
});

test('Super Admin creates a user with selected screen permissions and a salted password',t=>{
  const f=fixture();t.after(f.cleanup);
  const arjun=f.store.authenticate('arjun.sajimon','TestBootstrap!9');
  const created=f.store.create(arjun,{username:'reviews.viewer',displayName:'Reviews Viewer',password:'Temporary!1',roles:['user'],permissions:['screen:reviews']});
  assert.deepEqual(created.permissions,['screen:reviews']);
  assert.equal(f.store.authenticate('reviews.viewer','Temporary!1').username,'reviews.viewer');
  const saved=JSON.parse(fs.readFileSync(f.file,'utf8')).users.find(user=>user.username==='reviews.viewer');
  assert.equal(saved.credential.algorithm,'scrypt');
  assert.equal(JSON.stringify(saved).includes('Temporary!1'),false);
});

test('the active Super Admin cannot remove their own access',t=>{
  const f=fixture();t.after(f.cleanup);
  const arjun=f.store.authenticate('arjun.sajimon','TestBootstrap!9');
  assert.throws(()=>f.store.update(arjun,arjun.id,{roles:['admin']}),/cannot.*Super Admin/i);
  assert.throws(()=>f.store.update(arjun,arjun.id,{active:false}),/cannot deactivate/i);
});

test('an Admin cannot grant Super Admin access',t=>{
  const f=fixture();t.after(f.cleanup);
  const arjun=f.store.authenticate('arjun.sajimon','TestBootstrap!9');
  const admin=f.store.create(arjun,{username:'branch.admin',displayName:'Branch Admin',password:'Temporary!2',roles:['admin'],permissions:['screen:users','users.manage']});
  assert.throws(()=>f.store.create(admin,{username:'escalated.user',password:'Temporary!3',roles:['super_admin'],permissions:[]}),/Only a Super Admin/i);
});
