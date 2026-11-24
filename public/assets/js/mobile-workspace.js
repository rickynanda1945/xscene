import {icon,modal} from './ui.js?v=node1';
// Mobile layout module; the desktop generator remains the sole generation handler.
export function installMobileWorkspace({navigate,href}){
 const nav=document.createElement('nav');nav.className='mobile-app-nav';nav.setAttribute('aria-label','Mobile application navigation');
 nav.innerHTML=`<a href="${href('home')}" data-mobile-route="home">${icon('home')}<span>Home</span></a><a href="${href('projects')}" data-mobile-route="projects">${icon('projects')}<span>Projects</span></a><button type="button" class="mobile-generate" aria-label="Generate prompt">${icon('style')}<span>Generate</span></button><button type="button" class="mobile-library">${icon('products')}<span>Library</span></button><a href="${href('settings')}" data-mobile-route="settings">${icon('settings')}<span>Account</span></a>`;
 document.body.append(nav);let route='home';const generate=nav.querySelector('.mobile-generate');
 function refresh(){const desktop=document.querySelector('#generate'),busy=document.querySelector('#project-form[inert]');generate.disabled=route==='create'&&(!!busy||!!desktop?.disabled);generate.setAttribute('aria-busy',String(!!document.querySelector('.generation-tech[open]')));}
 generate.onclick=()=>{const button=document.querySelector('#generate');if(route==='create'&&button){if(!button.disabled)button.click();}else navigate('create');};
 nav.querySelector('.mobile-library').onclick=()=>{const links=[['characters','Characters'],['products','Photos / products'],['brands','Brand / Logo'],['backgrounds','Backgrounds'],['assets','Uploaded assets'],['templates','Templates'],['history','Prompt history']];const d=modal('Your library',`<div class="mobile-library-links">${links.map(([id,label])=>`<a href="${href(id)}">${icon(id)}<span>${label}</span>${icon('arrow')}</a>`).join('')}</div>`);d.querySelectorAll('.mobile-library-links a').forEach(a=>a.addEventListener('click',()=>d.close()));};
 const observer=new MutationObserver(refresh);observer.observe(document.querySelector('#main'),{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','inert']});
 return {sync(next){route=next;nav.querySelectorAll('[data-mobile-route]').forEach(a=>{const active=a.dataset.mobileRoute===next;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});refresh();}};
}
