const form=document.querySelector('#login-form');
const error=document.querySelector('#error');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');
  button.disabled=true;
  button.textContent='Signing in…';
  error.textContent='';
  try{
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Dashboard-Request':'1'},body:JSON.stringify({username:form.username.value,password:form.password.value})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.message||'Sign in failed.');
    location.replace('/');
  }catch(reason){error.textContent=reason.message;button.disabled=false;button.textContent='Sign in';}
});
