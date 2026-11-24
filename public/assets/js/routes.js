export const pages=['home','create','projects','characters','products','brands','backgrounds','assets','templates','history','settings'];
export function routeHref(route,base='/'){return base+(route==='home'?'dashboard':route);}
export function readRoute(url,base='/'){
 if(!url.pathname.startsWith(base))return null;
 const hash=url.hash.slice(1);
 if(pages.includes(hash))return hash;
 const path=url.pathname.slice(base.length).replace(/\/$/,'');
 if(['','dashboard','dashboard','home'].includes(path))return 'home';
 return pages.includes(path)?path:null;
}
