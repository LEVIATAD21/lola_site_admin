import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest as catalog} from '../functions/api/public/catalog.js';
import {onRequest as photo} from '../functions/api/public/imagens/[id].js';
test('public catalog returns only display fields and constrains published rows',async()=>{
 const DB={prepare(sql){assert.match(sql,/p.published = 1 AND p.archived_at IS NULL/);assert.doesNotMatch(sql,/admin_sessions|finance_payments|SELECT \*/);return {async all(){return {success:true,results:[{id:'piece-1',name:'Piece',category:'Brincos',description:'',price_cents:9000,disponivel:100,has_image:1,token_hash:'secret'}]};}};}};
 const context={request:new Request('https://api.example/api/public/catalog'),env:{DB}};
 const response=await catalog(context);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(Object.keys(body.products[0]).sort(),['id','name','category','description','price','disponivel','image'].sort());
 assert.equal(body.products[0].price,90);
 assert.equal(body.products[0].image,'/api/imagens/piece-1');
 assert.equal((await catalog({...context,request:new Request('https://api.example',{method:'POST'})})).status,405);
});
test('unpublished photo never reads photo bytes',async()=>{
 let photoRead=false;
 const context={request:new Request('https://api.example/api/public/imagens/piece-1'),params:{id:'piece-1'},env:{
 DB:{prepare(sql){assert.match(sql,/p.published=1 AND p.archived_at IS NULL/);return {bind(){return {async first(){return null;}};}};}},
 PHOTOS_DB:{prepare(){photoRead=true;throw Error('must not read');}}
 }};
 assert.equal((await photo(context)).status,404);
 assert.equal(photoRead,false);
});
