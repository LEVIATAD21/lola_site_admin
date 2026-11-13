import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, isRasterImage, loadProducts, safeImage, validProduct } from '../src/adminData.ts';
const product = {id:'a', name:'Brinco', sku:'A1', category:'Brincos', price:10, stock:2, published:true, image:''};
test('recupera armazenamento corrompido sem derrubar a interface',()=>{
 for(const value of ['{', '{}', '[null]', '[1]', JSON.stringify([{...product,price:'10'}]), JSON.stringify([product,product])])
  assert.deepEqual(loadProducts(value, [product]), [product]);
 assert.deepEqual(loadProducts('[]',[product]),[]);
});
test('recusa valores não finitos, estoque fracionado e limite excedido',()=>{
 assert.equal(validProduct(product),true);
 for(const patch of [{price:Infinity},{price:NaN},{price:-1},{stock:0.5},{stock:-1},{stock:1_000_001},{name:''},{sku:''}])
  assert.equal(validProduct({...product,...patch}),false);
});
test('neutraliza fórmulas em células exportadas sem perder aspas',()=>{
 for(const formula of ['=1+1','+SUM(A1)','-1+2','@SUM(A1)',' \t=1+1']) assert.ok(csvCell(formula).startsWith('"\''));
 assert.equal(csvCell('Peça "A"'), '"Peça ""A"""');
 assert.equal(csvCell('49.90'),'"49.90"');
});
test('recusa URLs de script, SVG e URLs com senha',()=>{
 for(const image of ['javascript:alert(1)','http://exemplo.com/a.png','https://nome:senha@exemplo.com/a.png','data:image/svg+xml;base64,PHN2Zz4=']) assert.equal(safeImage(image),false);
 assert.equal(safeImage('https://exemplo.com/a.jpg'),true);
});
test('verifica assinatura de arquivo raster e rejeita HTML e SVG',()=>{
 assert.equal(isRasterImage(new Uint8Array([255,216,255,224])),true);
 assert.equal(isRasterImage(new Uint8Array([137,80,78,71,13,10,26,10])),true);
 for(const input of ['<svg></svg>','<html></html>','']) assert.equal(isRasterImage(new TextEncoder().encode(input)),false);
});
