import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SCREEN_PERMISSIONS=['overview','branches','reviews','connection','users'];
export const ACTION_PERMISSIONS=['data.refresh','google.connect','users.view','users.manage'];
export const ALL_PERMISSIONS=[...SCREEN_PERMISSIONS.map(screen=>`screen:${screen}`),...ACTION_PERMISSIONS];
const ROLES=['user','admin','super_admin'];

const safeEqual=(left,right)=>{
  const a=Buffer.from(String(left??''));
  const b=Buffer.from(String(right??''));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
};
const now=()=>new Date().toISOString();
const normalizeUsername=value=>String(value??'').trim().toLowerCase();
const normalizeList=(values,allowed)=>[...new Set((Array.isArray(values)?values:[]).filter(value=>allowed.includes(value)))];
const publicUser=user=>({id:user.id,username:user.username,displayName:user.displayName,roles:user.roles,permissions:user.permissions,active:user.active,createdAt:user.createdAt,updatedAt:user.updatedAt,createdBy:user.createdBy,lastLoginAt:user.lastLoginAt??null});

function passwordCredential(password){
  const salt=crypto.randomBytes(16).toString('base64url');
  const hash=crypto.scryptSync(String(password),salt,64).toString('base64url');
  return {algorithm:'scrypt',salt,hash};
}

function matchesPassword(password,credential){
  if(!credential)return false;
  if(credential.algorithm==='sha256')return safeEqual(crypto.createHash('sha256').update(String(password??'')).digest('hex'),credential.hash);
  if(credential.algorithm!=='scrypt'||!credential.salt||!credential.hash)return false;
  return safeEqual(crypto.scryptSync(String(password??''),credential.salt,64).toString('base64url'),credential.hash);
}

function validatePassword(password){
  if(String(password??'').length<10)throw Error('Password must contain at least 10 characters.');
}

export function createUserStore({file,bootstrapUsername,bootstrapPassword,bootstrapPasswordHash}={}){
  if(!file)throw Error('User storage path is required.');
  const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {version:1,users:[]};}};
  const save=value=>{
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=`${file}.tmp`;
    fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});
    fs.renameSync(temp,file);
  };
  let state=read();
  if(!Array.isArray(state.users))state={version:1,users:[]};
  const bootstrap=normalizeUsername(bootstrapUsername);
  if(bootstrap){
    let user=state.users.find(item=>item.username===bootstrap);
    const stamp=now();
    if(!user){
      user={id:crypto.randomUUID(),username:bootstrap,displayName:'Arjun Sajimon',roles:['super_admin','admin'],permissions:[...ALL_PERMISSIONS],active:true,createdAt:stamp,updatedAt:stamp,createdBy:'system',lastLoginAt:null};
      state.users.push(user);
    }
    user.roles=['super_admin','admin'];
    user.permissions=[...ALL_PERMISSIONS];
    user.active=true;
    if(!user.credential){
      if(bootstrapPassword)user.credential=passwordCredential(bootstrapPassword);
      else if(bootstrapPasswordHash)user.credential={algorithm:'sha256',hash:String(bootstrapPasswordHash).toLowerCase()};
    }
    user.updatedAt=stamp;
    save(state);
  }

  const findByUsername=username=>state.users.find(user=>user.username===normalizeUsername(username));
  const findById=id=>state.users.find(user=>user.id===id);
  const requireUser=id=>{const user=findById(id);if(!user)throw Error('User not found.');return user;};
  const assertLastSuperAdmin=(target,nextRoles,nextActive)=>{
    if(!target.roles.includes('super_admin'))return;
    if(nextActive&&nextRoles.includes('super_admin'))return;
    const others=state.users.filter(user=>user.id!==target.id&&user.active&&user.roles.includes('super_admin'));
    if(!others.length)throw Error('At least one active Super Admin is required.');
  };
  const assertRoleGrant=(actor,roles)=>{
    if(roles.includes('super_admin')&&!actor.roles.includes('super_admin'))throw Error('Only a Super Admin can grant Super Admin access.');
  };

  return {
    configured:Boolean(bootstrap&&state.users.some(user=>user.username===bootstrap&&user.credential)),
    list:()=>state.users.map(publicUser).sort((a,b)=>a.username.localeCompare(b.username)),
    getByUsername:username=>{const user=findByUsername(username);return user?publicUser(user):null;},
    authenticate(username,password){
      const user=findByUsername(username);
      if(!user||!user.active||!matchesPassword(password,user.credential))return null;
      user.lastLoginAt=now();user.updatedAt=user.updatedAt||user.lastLoginAt;save(state);
      return publicUser(user);
    },
    create(actor,input){
      const username=normalizeUsername(input.username);
      if(!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username))throw Error('Username must be 3–64 characters using letters, numbers, dots, underscores or hyphens.');
      if(findByUsername(username))throw Error('A user with this username already exists.');
      validatePassword(input.password);
      const roles=normalizeList(input.roles,ROLES);if(!roles.length)roles.push('user');assertRoleGrant(actor,roles);
      const permissions=normalizeList(input.permissions,ALL_PERMISSIONS);
      const stamp=now();
      const user={id:crypto.randomUUID(),username,displayName:String(input.displayName??'').trim()||username,roles,permissions,active:input.active!==false,credential:passwordCredential(input.password),createdAt:stamp,updatedAt:stamp,createdBy:actor.username,lastLoginAt:null};
      state.users.push(user);save(state);return publicUser(user);
    },
    update(actor,id,input){
      const user=requireUser(id);
      const roles=input.roles===undefined?user.roles:normalizeList(input.roles,ROLES);
      if(!roles.length)roles.push('user');assertRoleGrant(actor,roles);
      const active=input.active===undefined?user.active:Boolean(input.active);
      if(user.id===actor.id&&(!active||!roles.includes('super_admin')))throw Error('You cannot deactivate your own account or remove your own Super Admin access.');
      assertLastSuperAdmin(user,roles,active);
      user.displayName=input.displayName===undefined?user.displayName:(String(input.displayName).trim()||user.username);
      user.roles=roles;
      if(input.permissions!==undefined)user.permissions=normalizeList(input.permissions,ALL_PERMISSIONS);
      user.active=active;
      if(input.password!==undefined&&input.password!==''){validatePassword(input.password);user.credential=passwordCredential(input.password);}
      user.updatedAt=now();save(state);return publicUser(user);
    }
  };
}
