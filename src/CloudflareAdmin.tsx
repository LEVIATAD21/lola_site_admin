import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Boxes, CheckCircle2, ChevronRight, CircleAlert, ExternalLink, ImagePlus,
  LayoutDashboard, LogOut, Package, Pencil, Plus, RefreshCw, Save, ShieldCheck,
  ShoppingBag, Trash2, Upload, X,
} from 'lucide-react';
import './cloudflare-admin.css';

type Product = {
  id: string; name: string; category: string; desc: string; price: number;
  disponivel: number; published: boolean; image: string;
};
type Editor = {
  id: string | null; name: string; category: string; desc: string; price: string;
  stock: string; published: boolean; image: string;
};
type Page = 'inicio' | 'produtos' | 'estoque';
const empty: Editor = { id:null,name:'',category:'Brincos',desc:'',price:'',stock:'0',published:false,image:'' };
const money = (n:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);
const categories = ['Brincos','Colares','Pulseiras','Anéis','Conjuntos','Outros'];

async function extract(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data.error === 'string' ? data.error : 'Não foi possível concluir a operação.';
    throw new Error(message);
  }
  return data;
}

async function compactPhoto(file: File): Promise<Blob> {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type))
    throw new Error('Escolha uma foto PNG, JPG ou WebP. SVG não é permitido.');
  if (file.size > 12 * 1024 * 1024)
    throw new Error('A foto original precisa ter até 12 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    let edge = 1200;
    for (let tries = 0; tries < 6; tries++) {
      const scale = Math.min(1, edge/Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('O navegador não conseguiu preparar a foto.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob|null>(resolve =>
        canvas.toBlob(resolve,'image/webp',tries < 3 ? 0.78 : 0.65));
      if (blob && blob.type === 'image/webp' && blob.size >= 20 && blob.size <= 300*1024) return blob;
      edge = Math.round(edge * 0.72);
    }
    throw new Error('Não foi possível compactar a foto para o limite de 300 KB.');
  } finally { bitmap.close(); }
}

export default function CloudflareAdmin() {
  const [auth, setAuth] = useState<'loading'|'guest'|'ready'>('loading');
  const [csrf, setCsrf] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [page,setPage] = useState<Page>('inicio');
  const [items,setItems] = useState<Product[]>([]);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [loadingProducts,setLoadingProducts] = useState(false);
  const [editor,setEditor] = useState<Editor|null>(null);
  const [file,setFile] = useState<File|null>(null);
  const [preview,setPreview] = useState('');
  const [filter,setFilter] = useState('');
  const [publicUrl,setPublicUrl] = useState('');

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let active = true;
    fetch('/api/session',{credentials:'same-origin',cache:'no-store'})
      .then(async response => {
        if (!active) return;
        if (response.status === 401) { setAuth('guest'); return; }
        const data = await extract(response);
        if (!active) return;
        if (data.authenticated && typeof data.csrfToken === 'string') {
          setCsrf(data.csrfToken); setAuth('ready');
        } else setAuth('guest');
      })
      .catch(e => { if (active) { setError(e instanceof Error ? e.message : 'Servidor indisponível.'); setAuth('guest'); } });
    return () => {active = false;};
  }, []);

  useEffect(() => {
    if (auth !== 'ready') return;
    void refresh();
    void fetch('/api/public-config',{credentials:'same-origin'}).then(r=>extract(r))
      .then(d=>{if(typeof d.publicSiteUrl==='string')setPublicUrl(d.publicSiteUrl);})
      .catch(()=>{});
  }, [auth]);

  async function api(path:string, method='GET', body?: unknown, token=csrf) {
    const headers: Record<string,string> = {accept:'application/json'};
    if (method !== 'GET') headers['x-csrf-token'] = token;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(path,{
      method,credentials:'same-origin',cache:'no-store',headers,
      body:body === undefined ? undefined : JSON.stringify(body),
    });
    if(response.status===401) {setAuth('guest');setCsrf('');setItems([]);}
    return extract(response);
  }

  async function refresh(){
    setLoadingProducts(true);
    try {
      const data = await api('/api/admin/catalog');
      if (!Array.isArray(data.products)) throw new Error('O banco retornou um catálogo inválido.');
      setItems(data.products.map((value:Product)=>({
        ...value,
        image: typeof value.image==='string'?value.image:'',
        desc:typeof value.desc==='string'?value.desc:'',
      })));
      setError('');
    } catch (e) { setError(e instanceof Error?e.message:'Não foi possível consultar o banco.'); }
    finally{setLoadingProducts(false);}
  }

  async function signIn(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setBusy(true);
    try {
      const data = await extract(await fetch('/api/login',{
        method:'POST',credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({username:user,password}),
      }));
      setCsrf(data.csrfToken);setPassword('');setAuth('ready');
    } catch(e){setError(e instanceof Error?e.message:'Falha de autenticação.');}
    finally{setBusy(false);}
  }
  async function signOut(){
    setBusy(true);
    try{await api('/api/logout','POST',{});setAuth('guest');setCsrf('');setItems([]);setNotice('');}
    catch(e){setError(e instanceof Error?e.message:'Erro ao sair.');}
    finally{setBusy(false);}
  }

  function edit(product?:Product) {
    setFile(null);setError('');
    if(!product) setEditor({...empty});
    else setEditor({id:product.id,name:product.name,category:product.category,
      desc:product.desc,price:String(product.price),stock:String(product.disponivel),
      published:product.published,image:product.image});
  }

  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!editor||busy)return;
    const price=Number(editor.price),stock=Number(editor.stock);
    if(!editor.name.trim()||!Number.isFinite(price)||price<0||
       !Number.isSafeInteger(stock)||stock<0||stock>1000000) {
      setError('Confira nome, preço e estoque (inteiro não negativo).');return;
    }
    setBusy(true);setError('');setNotice('');
    try {
      const payload={name:editor.name.trim(),category:editor.category,
        desc:editor.desc,material:'',color:'',price,published:editor.published};
      const data=await api(editor.id?'/api/admin/catalog/'+encodeURIComponent(editor.id):'/api/admin/catalog',
        editor.id?'PUT':'POST',payload);
      const product=data.product as Product;
      if(!product?.id)throw new Error('Servidor não confirmou o produto.');
      await api('/api/estoque/definir','POST',{productId:product.id,quantidade:stock});
      if(file){
        const optimized=await compactPhoto(file);
        const response=await fetch('/api/admin/imagens/'+encodeURIComponent(product.id),{
          method:'POST', credentials:'same-origin',
          headers:{'content-type':optimized.type,'x-csrf-token':csrf},
          body:optimized,
        });
        await extract(response);
      }
      setEditor(null);setFile(null);
      setNotice('Produto salvo no banco real da LOLA. A vitrine utiliza os produtos publicados.');
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'Falha ao salvar. Verifique antes de repetir.');
      await refresh();
    }finally{setBusy(false);}
  }

  async function remove(product:Product){
    if(!window.confirm('Excluir definitivamente "'+product.name+'"? O estoque deve estar zerado.')) return;
    setBusy(true);setError('');
    try{await api('/api/admin/catalog/'+encodeURIComponent(product.id),'DELETE',{});setNotice('Produto excluído.');await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Falha ao excluir.');}
    finally{setBusy(false);}
  }

  async function removePhoto(){
    if(!editor?.id||!window.confirm('Remover a foto deste produto?'))return;
    setBusy(true);
    try{
      await api('/api/admin/imagens/'+encodeURIComponent(editor.id),'DELETE',{});
      setEditor({...editor,image:''});setFile(null);
      setNotice('Foto removida.');await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível remover a foto.');}
    finally{setBusy(false);}
  }

  const units=items.reduce((sum,x)=>sum+x.disponivel,0);
  const published=items.filter(x=>x.published).length;
  const shown=useMemo(()=>items.filter(x=>(x.name+' '+x.category+' '+x.id).toLowerCase().includes(filter.toLowerCase())),[items,filter]);
  const nav: {id:Page;label:string;icon:typeof Package}[]=[
    {id:'inicio',label:'Visão geral',icon:LayoutDashboard},
    {id:'produtos',label:'Produtos',icon:Package},
    {id:'estoque',label:'Estoque',icon:Boxes},
  ];

  if(auth==='loading') return <div className="lola-login"><p>Verificando acesso seguro ao painel…</p></div>;
  if(auth==='guest') return (
    <div className="lola-login">
      <form className="lola-login-card" onSubmit={signIn}>
        <div className="lola-brand-dark">LOLA <small>PAINEL ADMINISTRATIVO</small></div>
        <ShieldCheck className="lola-login-shield" size={34}/>
        <h1>Acesso à loja</h1>
        <p>Gerencie fotos, preços, produtos e estoque com acesso privado.</p>
        {error&&<p role="alert" className="lola-error">{error}</p>}
        <label>Usuário administrativo<input autoComplete="username" required value={user} onChange={e=>setUser(e.target.value)} placeholder="Seu usuário"/></label>
        <label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha de acesso"/></label>
        <button className="lola-primary" disabled={busy} type="submit">{busy?'Verificando…':'Entrar no painel'} <ChevronRight size={18}/></button>
        <small className="lola-muted">As credenciais ficam no servidor Cloudflare, nunca no código público.</small>
      </form>
    </div>
  );

  return (
    <div className="lola-app">
      <aside className="lola-sidebar">
        <div className="lola-brand">LOLA <small>AÇO INOX · ADMIN</small></div>
        <p className="lola-nav-caption">MENU PRINCIPAL</p>
        {nav.map(({id,label,icon:Icon})=><button key={id} type="button"
          className={'lola-nav '+(page===id?'selected':'')}
          onClick={()=>setPage(id)}><Icon size={19}/>{label}{id==='produtos'&&<span className="lola-nav-count">{items.length}</span>}</button>)}
        <div className="lola-sidebar-foot"><ShieldCheck size={22}/><strong>Área protegida</strong>
          <p>Produtos e fotos são salvos no banco real.</p></div>
      </aside>
      <div className="lola-main">
        <header className="lola-top">
          <div><span className="lola-breadcrumb">LOLA</span> <ChevronRight size={14}/> {nav.find(n=>n.id===page)?.label}</div>
          <div className="lola-top-actions">
            {publicUrl&&<a href={publicUrl} target="_blank" rel="noopener noreferrer" className="lola-outline"><ExternalLink size={15}/> Ver loja</a>}
            <button className="lola-outline" onClick={()=>void refresh()} disabled={loadingProducts}><RefreshCw size={15}/> Atualizar</button>
            <button className="lola-outline" onClick={()=>void signOut()} disabled={busy}><LogOut size={15}/> Sair</button>
          </div>
        </header>
        <main className="lola-content">
          <div className="lola-heading">
            <div><p className="lola-eyebrow">ADMINISTRAÇÃO DA LOJA</p>
              <h1>{page==='inicio'?'Bem-vinda à LOLA':page==='produtos'?'Gerenciar produtos':'Controle de estoque'}</h1>
              <p>{page==='inicio'?'O que você cadastrar aqui será armazenado no banco da loja.':page==='produtos'?'Cadastre fotos, títulos, descrições e preços reais.':'Altere quantidades editando cada produto.'}</p></div>
            <button type="button" className="lola-primary" onClick={()=>edit()}><Plus size={17}/> Novo produto</button>
          </div>
          {error&&<div role="alert" className="lola-error lola-msg"><CircleAlert size={18}/>{error}<button onClick={()=>setError('')} aria-label="Fechar aviso"><X size={16}/></button></div>}
          {notice&&<div role="status" className="lola-success lola-msg"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice('')} aria-label="Fechar confirmação"><X size={16}/></button></div>}
          <div className="lola-stats">
            <div><span>Produtos cadastrados</span><strong>{items.length}</strong><Package size={21}/></div>
            <div><span>Publicados na loja</span><strong>{published}</strong><ShoppingBag size={21}/></div>
            <div><span>Unidades em estoque</span><strong>{units}</strong><Boxes size={21}/></div>
            <div><span>Sem estoque</span><strong>{items.filter(x=>x.disponivel===0).length}</strong><CircleAlert size={21}/></div>
          </div>
          {page==='inicio'&&<section className="lola-panel lola-intro">
            <div><h2>Seu catálogo começa aqui</h2><p>Ao criar um produto, você define nome, categoria, preço, quantidade e escolhe uma foto do celular ou computador. A foto é compactada e armazenada no D1. Você controla quando o produto aparece na vitrine pelo botão <strong>Publicar</strong>.</p>
              <p className="lola-muted">O painel não gera produtos fictícios e não processa pagamentos enquanto a integração financeira não estiver pronta.</p>
              <button className="lola-primary" type="button" onClick={()=>edit()}><Plus size={16}/> Cadastrar primeira peça</button></div>
            <ImagePlus size={82} strokeWidth={1.2} className="lola-intro-icon"/>
          </section>}
          {page!=='inicio'&&<section className="lola-panel">
            <div className="lola-table-heading">
              <div><h2>{page==='estoque'?'Inventário':'Catálogo'}</h2><p>{loadingProducts?'Sincronizando…':'Dados consultados diretamente no D1.'}</p></div>
              <input aria-label="Buscar produtos" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar por nome ou categoria…" />
            </div>
            {shown.length===0?<div className="lola-empty"><Package size={34}/><h3>Nenhum produto cadastrado</h3><p>Cadastre a primeira peça quando tiver informações reais.</p><button className="lola-primary" onClick={()=>edit()}><Plus size={16}/> Novo produto</button></div>:
              <div className="lola-overflow"><table><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>PREÇO</th><th>ESTOQUE</th><th>PUBLICAÇÃO</th><th>AÇÕES</th></tr></thead>
                <tbody>{shown.map(x=><tr key={x.id}>
                  <td><div className="lola-product-name">{x.image?<img src={x.image} alt={'Foto: '+x.name} loading="lazy"/>:<span className="lola-no-photo"><ImagePlus size={19}/></span>}<div><strong>{x.name}</strong><small>{x.id}</small></div></div></td>
                  <td>{x.category}</td><td>{money(x.price)}</td><td><span className={x.disponivel===0?'lola-zero':''}>{x.disponivel} un.</span></td>
                  <td><span className={'lola-status '+(x.published?'on':'off')}>{x.published?'Publicado':'Rascunho'}</span></td>
                  <td><div className="lola-table-actions"><button type="button" title="Editar" onClick={()=>edit(x)}><Pencil size={17}/></button><button type="button" title="Excluir" onClick={()=>void remove(x)} disabled={busy}><Trash2 size={17}/></button></div></td>
                </tr>)}</tbody></table></div>}
          </section>}
          <div className="lola-footnote"><ShieldCheck size={17}/> Painel administrativo independente. Somente usuários autenticados podem alterar o catálogo.</div>
        </main>
      </div>

      {editor&&<div className="lola-modal-backdrop" onClick={()=>{if(!busy){setEditor(null);setFile(null);}}}>
        <div className="lola-modal" role="dialog" aria-modal="true" aria-labelledby="product-editor-title" onClick={e=>e.stopPropagation()}>
          <header><div><p className="lola-eyebrow">CATÁLOGO REAL</p><h2 id="product-editor-title">{editor.id?'Editar produto':'Novo produto'}</h2></div>
            <button type="button" aria-label="Fechar formulário" onClick={()=>{setEditor(null);setFile(null);}} disabled={busy}><X size={20}/></button></header>
          <form onSubmit={save}>
            <label>Nome da peça<input required maxLength={180} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})} placeholder="Ex.: Brinco de aço inox dourado"/></label>
            <div className="lola-form-grid">
              <label>Categoria<select value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
              <label>Preço (R$)<input type="number" required min={0} max={999999} step={0.01} value={editor.price} onChange={e=>setEditor({...editor,price:e.target.value})} placeholder="0,00"/></label>
            </div>
            <div className="lola-form-grid">
              <label>Quantidade em estoque<input type="number" required min={0} max={1000000} step={1} value={editor.stock} onChange={e=>setEditor({...editor,stock:e.target.value})}/></label>
              <label className="lola-publish">Exibir na loja <input type="checkbox" checked={editor.published} onChange={e=>setEditor({...editor,published:e.target.checked})}/></label>
            </div>
            <label>Descrição<textarea rows={3} maxLength={2000} value={editor.desc} onChange={e=>setEditor({...editor,desc:e.target.value})} placeholder="Detalhes e material da peça…" /></label>
            <label className="lola-upload">
              <Upload size={20}/><span>{file?file.name:'Selecionar foto do celular ou computador'}</span>
              <small>JPG, PNG ou WebP · compactação automática · máximo 300 KB após processamento</small>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)} />
            </label>
            {(preview||editor.image)&&<div className="lola-image-preview"><img src={preview||editor.image} alt="Prévia da foto do produto"/>{editor.id&&editor.image&&!file&&<button type="button" className="lola-outline" onClick={()=>void removePhoto()} disabled={busy}>Remover foto atual</button>}</div>}
            <p className="lola-muted">Ao salvar, os dados são registrados no D1. Produtos não publicados ficam ocultos na vitrine.</p>
            <div className="lola-form-actions"><button type="button" className="lola-outline" disabled={busy} onClick={()=>{setEditor(null);setFile(null);}}>Cancelar</button>
              <button type="submit" className="lola-primary" disabled={busy}><Save size={16}/>{busy?'Salvando…':'Salvar no catálogo'}</button></div>
          </form>
        </div>
      </div>}
    </div>
  );
}
