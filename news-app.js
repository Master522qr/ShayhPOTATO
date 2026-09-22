(() => {
  const cfg=window.LUNAVISUAL_CONFIG||{}, $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function boot(){
    try{
      const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'lunavisual-auth-v2'}});
      const {data,error}=await sb.from('news').select('id,title,description,image_url,published_at').eq('is_published',true).order('published_at',{ascending:false}).limit(100);
      if(error)throw error;
      $('newsStatus').textContent=data?.length?`${data.length} публикаций`:'Пока новостей нет.';
      $('newsList').innerHTML=(data||[]).map(n=>`<article class="news-card">${n.image_url?`<img src="${esc(n.image_url)}" alt="${esc(n.title)}" loading="lazy">`:''}<div class="body"><div class="small muted">${new Date(n.published_at).toLocaleString('ru-RU')}</div><h3>${esc(n.title)}</h3><p>${esc(n.description)}</p></div></article>`).join('');
    }catch(e){$('newsStatus').className='status bad';$('newsStatus').textContent=`Не удалось загрузить новости: ${e.message}`}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
