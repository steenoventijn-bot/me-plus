import {build} from 'vite';
import {mkdir,cp,readdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const file of await readdir('.'))if(/^(index\.html|app\.js|sw\.js|manifest\.webmanifest|icon\.svg|styles.*\.css)$/.test(file))await cp(file,`dist/${file}`);
for(const dir of ['assets','parts'])await cp(dir,`dist/${dir}`,{recursive:true});
for(const file of ['q7a-scene-1.txt','q7a-scene-2.txt','q7a-house-1.txt'])await rm(`dist/parts/${file}`,{force:true});
await build({configFile:false,publicDir:false,build:{outDir:'dist/world',emptyOutDir:true,lib:{entry:'world/renderer.js',formats:['es'],fileName:()=> 'renderer.js'},sourcemap:false,chunkSizeWarningLimit:750}});
