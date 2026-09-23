import crypto from 'node:crypto';

const safeEqual=(left,right)=>{
  const a=Buffer.from(String(left??''));
  const b=Buffer.from(String(right??''));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
};

export function createAuth({username,password,secret,passwordHash}={}){
  const expectedUser=String(username??'');
  const expectedPassword=String(password??'');
  const expectedHash=String(passwordHash??'').toLowerCase();
  const signingKey=String(secret||expectedPassword||expectedHash);
  const configured=Boolean(expectedUser&&(expectedPassword||expectedHash)&&signingKey);
  const passwordMatches=value=>expectedHash
    ?safeEqual(crypto.createHash('sha256').update(String(value??'')).digest('hex'),expectedHash)
    :safeEqual(value,expectedPassword);
  const credentialsMatch=(user,pass)=>configured&&safeEqual(user,expectedUser)&&passwordMatches(pass);
  const issue=(now=Date.now(),ttlMs=8*60*60*1000)=>{
    if(!configured)throw Error('Application login is not configured.');
    const payload=Buffer.from(JSON.stringify({u:expectedUser,e:now+ttlMs})).toString('base64url');
    const signature=crypto.createHmac('sha256',signingKey).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  };
  const validate=(token,now=Date.now())=>{
    if(!configured||!token)return null;
    const [payload,signature,...extra]=String(token).split('.');
    if(!payload||!signature||extra.length)return null;
    const expected=crypto.createHmac('sha256',signingKey).update(payload).digest('base64url');
    if(!safeEqual(signature,expected))return null;
    try{
      const decoded=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
      return decoded.u===expectedUser&&Number(decoded.e)>now?decoded:null;
    }catch{return null;}
  };
  return {configured,credentialsMatch,issue,validate};
}
