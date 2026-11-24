let csrf='';
export async function api(action,data,query={}){
 const url=new URL('api/workspace',document.baseURI);url.searchParams.set('action',action);for(const [k,v] of Object.entries(query))url.searchParams.set(k,v);
 let response;
 try{response=await fetch(url,{credentials:'same-origin',headers:data?{'X-CSRF-Token':csrf,...(data instanceof FormData?{}:{'Content-Type':'application/json'})}:{},method:data?'POST':'GET',body:data?(data instanceof FormData?data:JSON.stringify(data)):undefined})}catch{throw new Error('Could not connect. Check your connection and try again.')}
 if(response.status===401){location.replace(new URL('login',document.baseURI).href);throw new Error('Please sign in to continue.')}
 let result;try{result=await response.json()}catch{throw new Error('The server returned an unexpected response. Check PHP and upload limits.')}
 if(!response.ok||!result.success)throw new Error(result.error?.message||'Something went wrong. Please try again.');
 if(action==='bootstrap')csrf=result.data.csrf;return result.data;
}
