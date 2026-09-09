(async()=>{try{
const V='14.0.0';
const files=['./parts/v7b-1.txt','./parts/v7b-2a.txt','./parts/v7b-2b.txt','./parts/v7b-3a.txt','./parts/v7b-3b.txt'];
const extra=['./parts/v7c-fix.txt','./parts/v8-fix.txt','./parts/v9-ui.txt','./parts/v9-media.txt','./parts/v10-social-1.txt','./parts/v10-social-2.txt','./parts/v10-runtime.txt','./parts/v11-account.txt','./parts/v11-avatar.txt','./parts/v11-social.txt','./parts/v11-runtime.txt','./parts/v12-world-core.txt','./parts/v12-world-ui.txt','./parts/v13-world-quality.txt','./parts/v13-avatar-quality.txt','./parts/v13-reader-quality.txt','./parts/v13-brand-quality.txt','./parts/v13-task-coins.txt','./parts/v13q4-critical-fixes.txt','./parts/v13q5-world-reference.txt','./parts/v13q6-world-rebuild.txt','./parts/v14-world.txt','./parts/v14-reader.txt','./parts/v14-brand.txt','./parts/v14-avatar.txt'];
const get=x=>fetch(`${x}?v=${V}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(x);return r.text()});
const [parts,extras]=await Promise.all([Promise.all(files.map(get)),Promise.all(extra.map(get))]);
let code=parts.join('');
const marker="document.addEventListener('visibilitychange'";
const cut=code.lastIndexOf(marker);
if(cut<0)throw new Error('v13 injectiepunt ontbreekt');
code=code.slice(0,cut)+extras.join('\n')+'\n'+code.slice(cut);
(0,eval)(code);
}catch(e){console.error(e);document.getElementById('app').innerHTML='<main style="padding:48px 20px;font:15px -apple-system,BlinkMacSystemFont,sans-serif">me+ kon de nieuwste versie niet laden. Controleer je verbinding en open de app opnieuw.</main>'}})();