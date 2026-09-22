(() => {
  'use strict';
  const cfg=window.LUNAVISUAL_CONFIG||{},$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let sb,session,ownedIds=new Set(),models=[];
  function setStatus(m,bad=false){$('status').textContent=m;$('status').className=`status ${bad?'bad':'ok'}`}
  async function auth(){sb=window.LunaVisualSupabase||window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'lunavisual-auth-v2'}});window.LunaVisualSupabase=sb;const {data}=await sb.auth.getSession();session=data.session;if(!session){location.href='profile.html?next=models.html';throw new Error('login_required')}}
  async function load(){
    const [m,o]=await Promise.all([sb.from('models').select('id,slug,name,description,preview_url,price_rub,active,asset_path').eq('active',true).order('created_at',{ascending:false}),sb.rpc('get_my_lunavisual_models')]);if(m.error)throw m.error;if(o.error)throw o.error;models=m.data||[];ownedIds=new Set((o.data||[]).map(x=>x.model_id));
    $('owned').innerHTML=(o.data||[]).length?(o.data||[]).map(x=>`<article class="model-card"><img src="${esc(x.preview_url||'lunavisual-logo.png')}" alt="${esc(x.name)}"><div class="body"><h3>${esc(x.name)}</h3><p class="muted">${esc(x.description||'')}</p><div class="row" style="margin-top:12px"><span class="tag ok">Куплено</span><button class="btn" data-download="${esc(x.model_id)}">Получить файл</button></div></div></article>`).join(''):'<div class="muted">У вас пока нет выданных моделек.</div>';
    $('catalog').innerHTML=models.length?models.map(x=>`<article class="model-card"><img src="${esc(x.preview_url||'lunavisual-logo.png')}" alt="${esc(x.name)}"><div class="body"><h3>${esc(x.name)}</h3><p class="muted">${esc(x.description||'')}</p><div class="model-price">${Number(x.price_rub||0).toLocaleString('ru-RU')} ₽</div>${ownedIds.has(x.id)?'<span class="tag ok">Уже в аккаунте</span>':`<button class="btn primary" data-buy="${esc(x.id)}">Купить</button>`}</div></article>`).join(''):'<div class="muted">Каталог пока пуст.</div>';
    document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy).catch(e=>setStatus(e.message,true)));document.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>download(b.dataset.download).catch(e=>setStatus(e.message,true)));
  }
  async function buy(id){const model=models.find(x=>x.id===id);const {data,error}=await sb.rpc('request_lunavisual_model_order',{p_model_id:id});if(error)throw error;const msg=`Хочу купить модельку LunaVisual: ${model?.name||id} (${model?.price_rub||0} ₽), заказ #${data}`;const via=confirm('Нажмите OK для FunPay. Нажмите Отмена для Telegram.');const ps=window.LUNAVISUAL_PUBLIC_SETTINGS||{};window.open(via?(ps.funpay_url||cfg.funpayUrl):`${ps.telegram_url||cfg.telegramUrl}?text=${encodeURIComponent(msg)}`,'_blank','noopener');setStatus(`Заказ #${data} создан. После подтверждения администратором моделька появится в аккаунте.`)}
  async function download(modelId){
    let model=models.find(x=>x.id===modelId);
    if(!model?.asset_path){const q=await sb.from('models').select('id,asset_path').eq('id',modelId).maybeSingle();if(q.error)throw q.error;model=q.data;}
    if(!model?.asset_path)throw new Error('Файл модели ещё не загружен администратором.');
    const {data,error}=await sb.storage.from('models-assets').createSignedUrl(model.asset_path,120);
    if(error)throw error;
    if(!data?.signedUrl)throw new Error('Не удалось создать ссылку на файл модели.');
    location.href=data.signedUrl;
  }
  async function boot(){try{await auth();await load()}catch(e){if(e.message!=='login_required')setStatus(e.message,true)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
