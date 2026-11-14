import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root=path.resolve('dist');
for(const p of ['index.html','_headers'])assert.ok(existsSync(path.join(root,p)),'Arquivo público necessário ausente: '+p);
const headers=readFileSync(path.join(root,'_headers'),'utf8');
assert.match(headers,/X-Robots-Tag: noindex/);
assert.match(headers,/Content-Security-Policy:/);
const assets=path.join(root,'assets');
assert.ok(existsSync(assets),'Bundle inexistente');
const js=readdirSync(assets).filter(x=>x.endsWith('.js'));
assert.ok(js.length>0,'Nenhum JavaScript gerado');
let total=0;
for(const name of js) {
 const content=readFileSync(path.join(assets,name),'utf8');
 assert.doesNotMatch(content,/lola-admin-demo|Brinco Coração|images\.unsplash\.com\/photo-1535632066927/,'Página de demo vazou para o bundle');
 assert.doesNotMatch(content,/LOLA_ADMIN_PASSWORD|LOLA_ADMIN_SESSION_SECRET|LOLA_ADMIN_API_KEY/,'Segredo servidor no browser');
 total+=Buffer.byteLength(content);
}
console.log('Cloudflare Admin: '+js.length+' bundles JS, '+total+' bytes; sem dados demonstrativos e sem marcadores de segredos.');
